import { describe, expect, it } from "vitest";

describe("index file-ops integration", () => {
  it("should import file-ops-tracker hook", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/index.ts", "utf-8");
    expect(source).toContain("createFileOpsTrackerHook");
    expect(source).toContain("fileOpsTrackerHook");
  });
});
