import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/llm/model-router.js";
import type { Settings } from "../../src/memory/settings.js";

const baseSettings: Settings = {
  provider: "openrouter",
  apiKey: "sk-test",
  openAICompatBaseUrl: "http://localhost:4000/v1",
  defaultModel: "anthropic/claude-sonnet-4-6",
  models: {
    fast: "anthropic/claude-haiku-4-5",
    balanced: "anthropic/claude-sonnet-4-6",
    powerful: "anthropic/claude-opus-4-6",
  },
  costMode: "balanced",
  maxTokenBudget: null,
  autoCompactAt: 0.85,
  permissions: {
    allowFileWrite: "ask",
    allowBash: "ask",
    allowNetwork: "ask",
  },
  mcpServers: {},
};

describe("ModelRouter", () => {
  it("returns powerful model for quality-first", () => {
    const router = new ModelRouter();
    const selected = router.select({ ...baseSettings, costMode: "quality-first" });
    expect(selected).toBe(baseSettings.models.powerful);
  });

  it("returns fast model for cost-first", () => {
    const router = new ModelRouter();
    const selected = router.select({ ...baseSettings, costMode: "cost-first" });
    expect(selected).toBe(baseSettings.models.fast);
  });
});
