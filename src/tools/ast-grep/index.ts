import { tool } from "@opencode-ai/plugin/tool";
import { spawn } from "node:child_process";
import * as v from "valibot";

/**
 * Check if ast-grep CLI (ast-grep) is available on the system.
 * Returns installation instructions if not found.
 */
export async function checkAstGrepAvailable(): Promise<{ available: boolean; message?: string }> {
  try {
    // Use which command to check if ast-grep exists
    const { spawnSync } = await import("node:child_process");
    
    // First try the standard which command
    let result = spawnSync("which", ["ast-grep"], { stdio: "pipe" });
    if (result.status === 0 && result.stdout.toString().trim()) {
      return { available: true };
    }
    
    // Fallback: check common cargo bin locations
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const cargoPaths = [
        `${homeDir}/.cargo/bin/ast-grep`,
        `/usr/local/bin/ast-grep`,
        `/opt/homebrew/bin/ast-grep`,
      ];
      
      for (const path of cargoPaths) {
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
      "ast-grep CLI not found. AST-aware search/replace will not work.\n" +
      "Install with one of:\n" +
      "  cargo install ast-grep --locked\n" +
      "  brew install ast-grep\n" +
      "  npm install -g @ast-grep/cli",
  };
}

const LANGUAGES = [
  "c",
  "cpp",
  "csharp",
  "css",
  "dart",
  "elixir",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "sql",
  "swift",
  "tsx",
  "typescript",
  "yaml",
] as const;

const PositionSchema = v.object({
  line: v.number(),
  column: v.number(),
});

const RangeSchema = v.object({
  start: PositionSchema,
  end: PositionSchema,
});

const MatchSchema = v.object({
  file: v.string(),
  range: RangeSchema,
  text: v.string(),
  replacement: v.optional(v.string()),
});

const MatchArraySchema = v.array(MatchSchema);

interface Match {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
  text: string;
  replacement?: string;
}

interface SgResult {
  matches: Match[];
  error?: string;
}

function parseMatchOutput(stdout: string): SgResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return { matches: [], error: "Failed to parse output" };
  }
  const result = v.safeParse(MatchArraySchema, raw);
  if (!result.success) {
    return { matches: [], error: "ast-grep output did not match expected schema" };
  }
  return { matches: result.output };
}

async function runSg(args: string[]): Promise<SgResult> {
  try {
    const proc = spawn("ast-grep", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Promise<string>((resolve, reject) => {
        let data = "";
        proc.stdout?.on("data", (chunk) => {
          data += chunk.toString();
        });
        proc.stdout?.on("end", () => resolve(data));
        proc.stdout?.on("error", reject);
      }),
      new Promise<string>((resolve, reject) => {
        let data = "";
        proc.stderr?.on("data", (chunk) => {
          data += chunk.toString();
        });
        proc.stderr?.on("end", () => resolve(data));
        proc.stderr?.on("error", reject);
      }),
      new Promise<number>((resolve, reject) => {
        proc.on("close", (code) => resolve(code ?? 0));
        proc.on("error", reject);
      }),
    ]);

    const isNoFilesFound = exitCode !== 0 && !stdout.trim() && stderr.includes("No files found");
    if (isNoFilesFound) {
      return { matches: [] };
    }
    if (exitCode !== 0 && !stdout.trim()) {
      return { matches: [], error: stderr.trim() || `Exit code ${exitCode}` };
    }

    if (!stdout.trim()) return { matches: [] };

    return parseMatchOutput(stdout);
  } catch (e) {
    const err = e as Error;
    if (err.message?.includes("ENOENT")) {
      return {
        matches: [],
        error:
          "ast-grep CLI not found. Install with:\n" +
          "  npm install -g @ast-grep/cli\n" +
          "  cargo install ast-grep --locked\n" +
          "  brew install ast-grep",
      };
    }
    return { matches: [], error: err.message };
  }
}

const MAX_DISPLAY_MATCHES = 100;
const MAX_MATCH_TEXT_LENGTH = 100;

function formatMatches(matches: Match[], isDryRun = false): string {
  if (matches.length === 0) return "No matches found";

  const truncated = matches.length > MAX_DISPLAY_MATCHES;
  const shown = matches.slice(0, MAX_DISPLAY_MATCHES);

  const lines = shown.map((m) => {
    const loc = `${m.file}:${m.range.start.line}:${m.range.start.column}`;
    const text = m.text.length > MAX_MATCH_TEXT_LENGTH ? `${m.text.slice(0, MAX_MATCH_TEXT_LENGTH)}...` : m.text;
    if (isDryRun && m.replacement) {
      return `${loc}\n  - ${text}\n  + ${m.replacement}`;
    }
    return `${loc}: ${text}`;
  });

  if (truncated) {
    lines.unshift(`Found ${matches.length} matches (showing first ${MAX_DISPLAY_MATCHES}):`);
  }

  return lines.join("\n");
}

export const ast_grep_search = tool({
  description:
    "Search code patterns using AST-aware matching. " +
    "Use meta-variables: $VAR (single node), $$$ (multiple nodes). " +
    "Patterns must be complete AST nodes. " +
    "Examples: 'console.log($MSG)', 'def $FUNC($$$):', 'async function $NAME($$$)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern with meta-variables"),
    lang: tool.schema.enum(LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search"),
  },
  execute: async (args) => {
    const sgArgs = ["run", "-p", args.pattern, "--lang", args.lang, "--json=compact"];
    if (args.paths?.length) {
      sgArgs.push(...args.paths);
    } else {
      sgArgs.push(".");
    }

    const sgOutput = await runSg(sgArgs);
    if (sgOutput.error) return `Error: ${sgOutput.error}`;
    return formatMatches(sgOutput.matches);
  },
});

export const ast_grep_replace = tool({
  description:
    "Replace code patterns with AST-aware rewriting. " +
    "Dry-run by default. Use meta-variables in rewrite to preserve matched content. " +
    "Example: pattern='console.log($MSG)' rewrite='logger.info($MSG)'",
  args: {
    pattern: tool.schema.string().describe("AST pattern to match"),
    rewrite: tool.schema.string().describe("Replacement pattern"),
    lang: tool.schema.enum(LANGUAGES).describe("Target language"),
    paths: tool.schema.array(tool.schema.string()).optional().describe("Paths to search"),
    apply: tool.schema.boolean().optional().describe("Apply changes (default: false, dry-run)"),
  },
  execute: async (args) => {
    const sgArgs = ["run", "-p", args.pattern, "-r", args.rewrite, "--lang", args.lang, "--json=compact"];

    if (args.apply) {
      sgArgs.push("--update-all");
    }

    if (args.paths?.length) {
      sgArgs.push(...args.paths);
    } else {
      sgArgs.push(".");
    }

    const sgOutput = await runSg(sgArgs);
    if (sgOutput.error) return `Error: ${sgOutput.error}`;

    const isDryRun = !args.apply;
    const output = formatMatches(sgOutput.matches, isDryRun);

    if (isDryRun && sgOutput.matches.length > 0) {
      return `${output}\n\n(Dry run - use apply=true to apply changes)`;
    }
    if (args.apply && sgOutput.matches.length > 0) {
      return `Applied ${sgOutput.matches.length} replacements:\n${output}`;
    }
    return output;
  },
});