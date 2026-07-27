// src/octto/session/server.ts

import { createServer as createHttpServer, IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as v from "valibot";
import { getHtmlBundle } from "@/octto/ui";
import { config } from "@/utils/config";
import { extractErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";
import { WsClientMessageSchema } from "./schemas";
import type { SessionStore } from "./sessions";
import type { WsClientMessage } from "./types";

interface WsData {
  sessionId: string;
}

interface ServerWithWs {
  server: HttpServer;
  wss: WebSocketServer;
  port: number;
  hostname?: string;
  stop: () => Promise<void>;
}

export async function createServer(
  sessionId: string,
  store: SessionStore,
): Promise<{ server: ServerWithWs; port: number }> {
  const htmlBundle = getHtmlBundle();

  const httpServer = createHttpServer((req, res) => {
    handleFetch(req, res, sessionId, htmlBundle);
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", `http://localhost`);
    if (url.pathname === "/ws") {
      ws.sessionId = sessionId;
      store.handleWsConnect(sessionId, ws);
      ws.on("close", () => store.handleWsDisconnect(sessionId));
      ws.on("message", (message: Buffer) => handleWsMessage(ws, message, store));
    } else {
      ws.close(400, "Invalid path");
    }
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "", `http://localhost`);
    if (url.pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  const hostname = config.octto.allowRemoteBind ? config.octto.bindAddress : "127.0.0.1";

  await new Promise<void>((resolve, reject) => {
    httpServer.listen({ port: 0, hostname }, (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const serverHostname = typeof address === "object" && address ? address.address : "127.0.0.1";

  const serverWithWs: ServerWithWs = {
    server: httpServer,
    wss,
    port,
    hostname: serverHostname,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err) reject(err);
          else {
            httpServer.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      }),
  };

  return { server: serverWithWs, port };
}

function handleFetch(
  req: IncomingMessage,
  res: { writeHead: (status: number, headers?: Record<string, string>) => void; end: (data?: string) => void },
  sessionId: string,
  htmlBundle: string,
): void {
  const url = new URL(req.url || "", `http://localhost`);

  // WebSocket upgrade is handled separately via httpServer.on("upgrade")

  // Serve the bundled HTML app
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlBundle);
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
}

function handleWsMessage(ws: WebSocket & { sessionId?: string }, message: Buffer, store: SessionStore): void {
  if (!ws.sessionId) return;
  const sessionId = ws.sessionId;

  let raw: unknown;
  try {
    raw = JSON.parse(message.toString());
  } catch (error) {
    log.error("octto", "Failed to parse WebSocket message", error);
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Invalid message format",
        details: extractErrorMessage(error),
      }),
    );
    return;
  }

  const result = v.safeParse(WsClientMessageSchema, raw);
  if (!result.success) {
    log.error("octto", "Invalid WebSocket message schema", result.issues);
    ws.send(
      JSON.stringify({
        type: "error",
        error: "Invalid message schema",
        details: result.issues.map((i) => i.message).join("; "),
      }),
    );
    return;
  }

  store.handleWsMessage(sessionId, result.output as WsClientMessage);
}

// Extend WebSocket type to include sessionId
declare module "ws" {
  interface WebSocket {
    sessionId?: string;
  }
}