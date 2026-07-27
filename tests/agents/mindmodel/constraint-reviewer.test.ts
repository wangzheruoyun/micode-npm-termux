// tests/agents/mindmodel/constraint-reviewer.test.ts
import { describe, expect, it } from "vitest";

import { constraintReviewerAgent } from "../../../src/agents/mindmodel/constraint-reviewer";

describe("constraint-reviewer agent", () => {
  it("should be a subagent", () => {
    expect(constraintReviewerAgent.mode).toBe("subagent");
  });

  it("should have read-only tool access", () => {
    expect(constraintReviewerAgent.tools?.write).toBe(false);
    expect(constraintReviewerAgent.tools?.edit).toBe(false);
    expect(constraintReviewerAgent.tools?.bash).toBe(false);
  });

  it("should have prompt that reviews code against constraints", () => {
    expect(constraintReviewerAgent.prompt).toContain("violation");
    expect(constraintReviewerAgent.prompt).toContain("constraint");
  });
});
