// tests/mindmodel/classifier.test.ts
import { describe, expect, it } from "vitest";

import { buildClassifierPrompt, parseClassifierResponse } from "../../src/mindmodel/classifier";
import type { MindmodelManifest } from "../../src/mindmodel/types";

describe("mindmodel classifier", () => {
  const manifest: MindmodelManifest = {
    name: "test",
    version: 1,
    categories: [
      { path: "components/button.md", description: "Button component patterns" },
      { path: "components/form.md", description: "Form patterns with validation" },
      { path: "pages/settings.md", description: "Settings page layout" },
      { path: "patterns/data-fetching.md", description: "Data fetching with loading states" },
    ],
  };

  it("should build classifier prompt with manifest categories", () => {
    const prompt = buildClassifierPrompt("Add a settings page with a form", manifest);

    expect(prompt).toContain("Add a settings page with a form");
    expect(prompt).toContain("components/button.md");
    expect(prompt).toContain("Form patterns with validation");
    expect(prompt).toContain("JSON array");
  });

  it("should parse valid classifier response", () => {
    const response = '["components/form.md", "pages/settings.md"]';
    const result = parseClassifierResponse(response, manifest);

    expect(result).toEqual(["components/form.md", "pages/settings.md"]);
  });

  it("should filter out invalid paths from response", () => {
    const response = '["components/form.md", "invalid/path.md", "pages/settings.md"]';
    const result = parseClassifierResponse(response, manifest);

    expect(result).toEqual(["components/form.md", "pages/settings.md"]);
  });

  it("should return empty array for malformed response", () => {
    const response = "not valid json";
    const result = parseClassifierResponse(response, manifest);

    expect(result).toEqual([]);
  });

  it("should parse response wrapped in markdown code block", () => {
    const response = '```json\n["components/form.md"]\n```';
    const result = parseClassifierResponse(response, manifest);
    expect(result).toEqual(["components/form.md"]);
  });
});
