// tests/agents/mindmodel/dependency-mapper.test.ts
import { describe, expect, it } from "vitest";

import { dependencyMapperAgent } from "../../../src/agents/mindmodel/dependency-mapper";

describe("dependency-mapper agent", () => {
  it("should be a subagent", () => {
    expect(dependencyMapperAgent.mode).toBe("subagent");
  });

  it("should have read-only tool access", () => {
    expect(dependencyMapperAgent.tools?.write).toBe(false);
    expect(dependencyMapperAgent.tools?.edit).toBe(false);
    expect(dependencyMapperAgent.tools?.bash).toBe(false);
  });

  it("should have prompt that analyzes imports", () => {
    expect(dependencyMapperAgent.prompt).toContain("import");
    expect(dependencyMapperAgent.prompt).toContain("dependencies");
  });
});
