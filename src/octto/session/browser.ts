// src/octto/session/browser.ts
// Cross-platform browser opener
import { spawn } from "node:child_process";

/**
 * Opens the default browser to the specified URL.
 * Detects platform and uses appropriate command.
 */
export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  let command: string;
  let args: string[];

  switch (platform) {
    case "darwin":
      command = "open";
      args = [url];
      break;
    case "win32":
      command = "cmd";
      args = ["/c", "start", url];
      break;
    default:
      // Linux and others
      command = "xdg-open";
      args = [url];
      break;
  }

  const proc = spawn(command, args, {
    stdio: "ignore",
  });

  await new Promise<void>((resolve, reject) => {
    proc.on("exit", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`Browser open failed with code ${code}`));
    });
    proc.on("error", reject);
  });
}
