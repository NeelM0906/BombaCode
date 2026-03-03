import { describe, expect, it } from "vitest";
import { ModelRouter, estimateComplexity } from "../../src/llm/model-router.js";
import { CostTracker } from "../../src/llm/cost-tracker.js";
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

  it("returns balanced model by default in balanced mode", () => {
    const router = new ModelRouter();
    const selected = router.select({ ...baseSettings, costMode: "balanced" });
    expect(selected).toBe(baseSettings.models.balanced);
  });

  it("routes to fast model for simple messages in balanced mode", () => {
    const router = new ModelRouter();
    const selected = router.select(
      { ...baseSettings, costMode: "balanced" },
      { userMessage: "fix typo in readme" }
    );
    expect(selected).toBe(baseSettings.models.fast);
  });

  it("routes to powerful model for complex messages in balanced mode", () => {
    const router = new ModelRouter();
    const selected = router.select(
      { ...baseSettings, costMode: "balanced" },
      { userMessage: "refactor the entire authentication module to use JWT tokens across all services" }
    );
    expect(selected).toBe(baseSettings.models.powerful);
  });

  it("downgrades to fast model when budget is nearly exhausted", () => {
    const router = new ModelRouter();
    const costTracker = new CostTracker();

    // Simulate high cost by recording usage
    costTracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 200_000,
    });

    const settings = { ...baseSettings, costMode: "quality-first" as const, maxTokenBudget: 5 };

    const selected = router.select(settings, { costTracker });
    expect(selected).toBe(baseSettings.models.fast);
  });

  it("does not downgrade when budget is null", () => {
    const router = new ModelRouter();
    const costTracker = new CostTracker();

    costTracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 200_000,
    });

    const selected = router.select(
      { ...baseSettings, costMode: "quality-first", maxTokenBudget: null },
      { costTracker }
    );
    expect(selected).toBe(baseSettings.models.powerful);
  });
});

describe("estimateComplexity", () => {
  it("returns low complexity for simple messages", () => {
    const score = estimateComplexity("fix typo");
    expect(score).toBeLessThan(4);
  });

  it("returns high complexity for complex messages", () => {
    const score = estimateComplexity(
      "refactor the entire codebase to use dependency injection across src/auth.ts, src/db.ts, src/api.ts, src/utils.ts, src/config.ts, and src/main.ts"
    );
    expect(score).toBeGreaterThanOrEqual(7);
  });

  it("gives higher score for longer messages", () => {
    const short = estimateComplexity("hello");
    const long = estimateComplexity("a".repeat(600));
    expect(long).toBeGreaterThan(short);
  });

  it("gives higher score for messages with code blocks", () => {
    const without = estimateComplexity("update the function");
    const with_ = estimateComplexity("update the function ```ts\nconst x = 1;\n```");
    expect(with_).toBeGreaterThanOrEqual(without);
  });

  it("clamps between 1 and 10", () => {
    const low = estimateComplexity("fix typo");
    const high = estimateComplexity(
      "refactor architect design implement migrate rewrite " + "a".repeat(2000) +
      " foo.ts bar.ts baz.ts qux.ts abc.ts def.ts ```code``` ```more```"
    );
    expect(low).toBeGreaterThanOrEqual(1);
    expect(low).toBeLessThanOrEqual(10);
    expect(high).toBeGreaterThanOrEqual(1);
    expect(high).toBeLessThanOrEqual(10);
  });
});

describe("ModelRouter fallback", () => {
  it("returns next model in chain after failure", () => {
    const router = new ModelRouter();
    const next = router.getNextFallback("anthropic/claude-opus-4-6", baseSettings);
    expect(next).toBe("anthropic/claude-sonnet-4-6");
  });

  it("returns fast model as last fallback after balanced fails", () => {
    const router = new ModelRouter();
    const next = router.getNextFallback("anthropic/claude-sonnet-4-6", baseSettings);
    expect(next).toBe("anthropic/claude-haiku-4-5");
  });

  it("returns null when no more fallbacks available", () => {
    const router = new ModelRouter();
    const next = router.getNextFallback("anthropic/claude-haiku-4-5", baseSettings);
    expect(next).toBeNull();
  });

  it("identifies retriable errors", () => {
    const router = new ModelRouter();
    expect(router.isRetriableError(new Error("429 Too Many Requests"))).toBe(true);
    expect(router.isRetriableError(new Error("500 Internal Server Error"))).toBe(true);
    expect(router.isRetriableError(new Error("Request timed out"))).toBe(true);
    expect(router.isRetriableError(new Error("Invalid API key"))).toBe(false);
  });
});
