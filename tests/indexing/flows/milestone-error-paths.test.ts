// SKIP: Requires FTS5 which is not available in sql.js WASM build
// tests/indexing/flows/milestone-error-paths.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MILESTONE_ARTIFACT_TYPES } from "../../../src/indexing/milestone-artifact-classifier";
import { ingestMilestoneArtifact } from "../../../src/indexing/milestone-artifact-ingest";
import { createArtifactIndex } from "../../../src/tools/artifact-index";

describe.skip("milestone artifact ingest error paths", () => {
  let testDir: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = join(tmpdir(), `milestone-error-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    consoleErrorSpy.mockRestore();
  });

  it("falls back to session when classifier fails", async () => {
    const index = await createArtifactIndex(testDir);
    await index.initialize();

    try {
      await ingestMilestoneArtifact(
        {
          id: "artifact-err",
          milestoneId: "ms-err",
          sourceSessionId: "session-err",
          createdAt: "2026-01-16T13:00:00Z",
          tags: ["error"],
          payload: "Status update only.",
        },
        index,
        () => {
          throw new Error("classifier failure");
        },
      );

      const results = await index.searchMilestoneArtifacts("status", {
        milestoneId: "ms-err",
        limit: 10,
      });

      expect(results).toHaveLength(1);
      expect(results[0].artifactType).toBe(MILESTONE_ARTIFACT_TYPES.SESSION);
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      await index.close();
    }
  });
});
