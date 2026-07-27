import { describe, expect, it } from "vitest";

import {
  classifyMilestoneArtifact,
  MILESTONE_ARTIFACT_TYPES,
} from "../../../src/indexing/milestone-artifact-classifier";

describe("classifyMilestoneArtifact", () => {
  it("classifies feature content", () => {
    const content = "Requirement: add scoped implementation details for indexing.";
    expect(classifyMilestoneArtifact(content)).toBe(MILESTONE_ARTIFACT_TYPES.FEATURE);
  });

  it("classifies decision content", () => {
    const content = "Decision: we decided on SQLite storage because of reliability.";
    expect(classifyMilestoneArtifact(content)).toBe(MILESTONE_ARTIFACT_TYPES.DECISION);
  });

  it("classifies session content", () => {
    const content = "Meeting notes: status updates and discussion items.";
    expect(classifyMilestoneArtifact(content)).toBe(MILESTONE_ARTIFACT_TYPES.SESSION);
  });

  it("prefers feature over decision over session", () => {
    const content = "Decision: we decided on the implementation details and requirements.";
    expect(classifyMilestoneArtifact(content)).toBe(MILESTONE_ARTIFACT_TYPES.FEATURE);
  });
});
