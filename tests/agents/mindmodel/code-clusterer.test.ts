// tests/agents/mindmodel/code-clusterer.test.ts
import { describe, expect, it } from "vitest";

import { codeClustererAgent } from "../../../src/agents/mindmodel/code-clusterer";

describe("code-clusterer agent", () => {
  it("should be a subagent", () => {
    expect(codeClustererAgent.mode).toBe("subagent");
  });

  it("should have read-only tool access", () => {
    expect(codeClustererAgent.tools?.write).toBe(false);
    expect(codeClustererAgent.tools?.edit).toBe(false);
    expect(codeClustererAgent.tools?.bash).toBe(false);
  });

  it("should have prompt that groups similar code", () => {
    expect(codeClustererAgent.prompt).toContain("cluster");
    expect(codeClustererAgent.prompt).toContain("pattern");
  });
});
