import { describe, expect, it } from "vitest";
import { shouldAutoSubmitInitialPrompt } from "../../src/cli/app.js";

describe("shouldAutoSubmitInitialPrompt", () => {
  it("returns true for a new non-empty initial prompt", () => {
    expect(shouldAutoSubmitInitialPrompt("fix auth bug", undefined)).toBe(true);
  });

  it("returns false when prompt was already submitted", () => {
    expect(shouldAutoSubmitInitialPrompt("fix auth bug", "fix auth bug")).toBe(false);
  });

  it("returns false for missing or blank prompts", () => {
    expect(shouldAutoSubmitInitialPrompt(undefined, undefined)).toBe(false);
    expect(shouldAutoSubmitInitialPrompt("   ", undefined)).toBe(false);
  });
});
