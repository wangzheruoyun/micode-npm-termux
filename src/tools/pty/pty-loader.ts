// src/tools/pty/pty-loader.ts
// Resolves zigpty native library path and loads zigpty with graceful degradation.
//
// zigpty is a Zig-based PTY library with prebuilt binaries for Linux, macOS, Windows, and Android.
// It automatically falls back to a pure-TypeScript pipe-based PTY when native bindings can't load.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { extractErrorMessage } from "@/utils/errors";
import { log } from "@/utils/logger";

const LOG_TAG = "pty.loader";

type ZigPtyModule = typeof import("zigpty");

let ptyModule: ZigPtyModule | null = null;
let loadAttempted = false;
let loadError: string | null = null;

function resolveNativeLibNames(platform: string, arch: string): string[] {
  if (platform === "darwin") {
    return arch === "arm64" ? ["libzigpty_arm64.dylib", "libzigpty.dylib"] : ["libzigpty.dylib"];
  }
  if (platform === "win32") {
    return ["zigpty.dll"];
  }
  return arch === "arm64" ? ["libzigpty_arm64.so", "libzigpty.so"] : ["libzigpty.so"];
}

/**
 * Probe additional paths where the zigpty native library might live.
 */
function probeZigPtyLib(): void {
  if (process.env.ZIGPTY_LIB) return;

  const platform = process.platform;
  const arch = process.arch;
  const filenames = resolveNativeLibNames(platform, arch);
  const cwd = process.cwd();

  const additionalBasePaths = [
    join(cwd, ".opencode", "node_modules", "zigpty", "zig-out", "lib"),
    join(cwd, ".micode", "node_modules", "zigpty", "zig-out", "lib"),
  ];

  try {
    const zigPtyMain = require.resolve("zigpty");
    if (zigPtyMain) {
      const pkgDir = dirname(dirname(zigPtyMain));
      additionalBasePaths.unshift(join(pkgDir, "zig-out", "lib"));
    }
  } catch {
    // ignore
  }

  const candidates = additionalBasePaths.flatMap((basePath) => filenames.map((f) => join(basePath, f)));
  const found = candidates.find((c) => existsSync(c));
  if (found) {
    process.env.ZIGPTY_LIB = found;
    log.info(LOG_TAG, `Auto-resolved ZIGPTY_LIB=${found}`);
  }
}

/**
 * Dynamically load zigpty with graceful degradation.
 * Sets ZIGPTY_LIB env var before import to fix path resolution
 * in OpenCode plugin environments.
 *
 * Returns null if zigpty cannot be loaded (native library missing, etc.)
 * The library itself falls back to a pure-TypeScript pipe-based PTY.
 */
export async function loadZigPty(): Promise<ZigPtyModule | null> {
  if (loadAttempted) return ptyModule;
  loadAttempted = true;

  probeZigPtyLib();

  try {
    ptyModule = await import("zigpty");
    log.info(LOG_TAG, "zigpty loaded successfully");
    return ptyModule;
  } catch (error) {
    loadError = extractErrorMessage(error);
    const firstLine = loadError.split("\n")[0];
    log.warn(LOG_TAG, `zigpty unavailable: ${firstLine}`);
    log.warn(LOG_TAG, "PTY tools will use pipe fallback. Set ZIGPTY_LIB env var to the native library path to fix.");
    ptyModule = null;
    return null;
  }
}

/**
 * Check if zigpty native bindings are available (must call loadZigPty first).
 */
export function isZigPtyAvailable(): boolean {
  return ptyModule !== null;
}

/**
 * Get the load error message, if any.
 */
export function getZigPtyLoadError(): string | null {
  return loadError;
}