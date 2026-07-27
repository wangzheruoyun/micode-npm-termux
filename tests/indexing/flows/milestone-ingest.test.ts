// tests/indexing/flows/milestone-ingest.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ingestMilestoneArtifact } from "../../../src/indexing/milestone-artifact-ingest";
import { createArtifactIndex } from "../../../src/tools/artifact-index";

// SKIP: FTS5 not available in sql.js WASM build (requires custom build with FTS5 extension)
// These tests work with better-sqlite3 which has FTS5 built-in
describe.skip("milestone artifact ingest", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `milestone-ingest-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("classifies and stores milestone artifacts", async () => {
    const index = await createArtifactIndex(testDir);
    await index.initialize();

    try {
      await ingestMilestoneArtifact(
        {
          id: "artifact-3",
          milestoneId: "ms-3",
          sourceSessionId: "session-3",
          createdAt: "2026-01-16T12:00:00Z",
          tags: ["feature", "milestone"],
          payload: "Implementation details for the indexing pipeline.",
        },
        index,
      );

      const results = await index.searchMilestoneArtifacts("implementation", {
        milestoneId: "ms-3",
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].artifactType).toBe("feature");
    } finally {
      await index.close();
    }
  });
});
