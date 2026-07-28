import { tool } from "@opencode-ai/plugin/tool";
import { spawn } from "node:child_process";
import { config } from "@/utils/config";
import { extractErrorMessage } from "@/utils/errors";

/**
 * Check if seek CLI is available on the system.
 * Returns installation instructions if not found.
 */
export async function checkSeekAvailable(): Promise<{ available: boolean; message?: string }> {
  try {
    const { spawnSync } = await import("node:child_process");
    
    // First try the standard which command
    let result = spawnSync("which", ["seek"], { stdio: "pipe" });
    if (result.status === 0 && result.stdout.toString().trim()) {
      return { available: true };
    }
    
    // Fallback: check common install locations
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const commonPaths = [
        `${homeDir}/.local/bin/seek`,
        `${homeDir}/.cargo/bin/seek`,
        `/usr/local/bin/seek`,
        `/opt/homebrew/bin/seek`,
      ];
      
      for (const path of commonPaths) {
        try {
          const { spawnSync } = await import("node:child_process");
          const result = spawnSync(path, ["--version"], { stdio: "pipe" });
          if (result.status === 0) {
            return { available: true };
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // which command failed
  }
  return {
    available: false,
    message:
      "seek CLI not found. Codebase search will not work.\n" +
      "Install with: curl -fsSL https://raw.githubusercontent.com/dualeai/seek/main/install.sh | bash\n" +
      "Or see: https://github.com/dualeai/seek",
  };
}

async function runSeek(args: string[]): Promise<{ output: string; error?: string }> {
  try {
    const proc = spawn("seek", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error("seek command timed out after 2 minutes"));
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
          "seek CLI not found. Install with: curl -fsSL https://raw.githubusercontent.com/dualeai/seek/main/install.sh | bash\n" +
          "See: https://github.com/dualeai/seek",
      };
    }
    return { output: "", error: msg };
  }
}

export const seek_ask = tool({
  description:
    "Ask questions about codebase using seek. " +
    "Provides ranked, context-rich code search with semantic and BM25 hybrid search. " +
    "Use for understanding codebase structure, finding implementations, or debugging. " +
    "See https://github.com/dualeai/seek",
  args: {
    tech: tool.schema.string().describe("Project path or repository to search (e.g., '.', '/path/to/repo')"),
    question: tool.schema.string().describe("Question to ask about the codebase"),
  },
  execute: async (args) => {
    const seekOutput = await runSeek(["ask", "-p", args.tech, "-q", args.question]);

    if (seekOutput.error) {
      return `Error: ${seekOutput.error}`;
    }

    return seekOutput.output || "No answer found";
  },
});