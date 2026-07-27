import { tool } from "@opencode-ai/plugin/tool";
import { spawn } from "node:child_process";
import { config } from "@/utils/config";
import { extractErrorMessage } from "@/utils/errors";

/**
 * Check if btca CLI is available on the system.
 * Returns installation instructions if not found.
 */
export async function checkBtcaAvailable(): Promise<{ available: boolean; message?: string }> {
  try {
    // Use which command to check if btca exists
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("which", ["btca"], { stdio: "pipe" });
    if (result.status === 0 && result.stdout.toString().trim()) {
      return { available: true };
    }
  } catch {
    // which command failed
  }
  return {
    available: false,
    message:
      "btca CLI not found. Library source code search will not work.\n" +
      "Install from: https://github.com/davis7dotsh/better-context\n" +
      "  npm add -g btca",
  };
}

async function runBtca(args: string[]): Promise<{ output: string; error?: string }> {
  try {
    const proc = spawn("btca", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error("btca command timed out after 2 minutes"));
      }, config.timeouts.btcaMs);
    });

    // Race between process completion and timeout
    const [stdout, stderr, exitCode] = await Promise.race([
      new Promise<[string, string, number]>((resolve, reject) => {
        let stdoutData = "";
        let stderrData = "";

        proc.stdout?.on("data", (chunk) => {
          stdoutData += chunk.toString();
        });
        proc.stderr?.on("data", (chunk) => {
          stderrData += chunk.toString();
        });
        proc.on("close", (code) => {
          resolve([stdoutData, stderrData, code ?? 0]);
        });
        proc.on("error", reject);
      }),
      timeoutPromise,
    ]);

    if (exitCode !== 0) {
      const errorMsg = stderr.trim() || `Exit code ${exitCode}`;
      return { output: "", error: errorMsg };
    }

    return { output: stdout.trim() };
  } catch (e) {
    const msg = extractErrorMessage(e);
    if (msg.includes("ENOENT")) {
      return {
        output: "",
        error:
          "btca CLI not found. Install from: https://github.com/davis7dotsh/better-context\n" + "  npm add -g btca",
      };
    }
    return { output: "", error: msg };
  }
}

export const btca_ask = tool({
  description:
    "Ask questions about library/framework source code using btca. " +
    "Clones repos locally and searches source code to answer questions. " +
    "Use for understanding library internals, finding implementation details, or debugging.",
  args: {
    tech: tool.schema.string().describe("Resource name configured in btca (e.g., 'react', 'express')"),
    question: tool.schema.string().describe("Question to ask about the library source code"),
  },
  execute: async (args) => {
    const btcaOutput = await runBtca(["ask", "-t", args.tech, "-q", args.question]);

    if (btcaOutput.error) {
      return `Error: ${btcaOutput.error}`;
    }

    return btcaOutput.output || "No answer found";
  },
});