import { describe, expect, it } from "vitest";
import { CostTracker } from "../../src/llm/cost-tracker.js";

describe("CostTracker", () => {
  it("computes basic cost from input and output tokens", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    // sonnet: input=$3/1M, output=$15/1M → $3 + $15 = $18
    expect(tracker.getSessionCost()).toBeCloseTo(18, 2);
    expect(tracker.getTotalTokens()).toBe(2_000_000);
    expect(tracker.getInputTokens()).toBe(1_000_000);
    expect(tracker.getOutputTokens()).toBe(1_000_000);
    expect(tracker.getTurnCount()).toBe(1);
  });

  it("applies 90% discount on cache reads (additive, not subtracted)", () => {
    const tracker = new CostTracker();
    // 1000 base input + 500 cache reads (reported separately by Anthropic)
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 1000,
      outputTokens: 0,
      cacheReadTokens: 500,
    });

    // base: 1000 * $3/1M = $0.003
    // cache reads: 500 * $3/1M * 0.1 = $0.00015
    // total: $0.00315
    expect(tracker.getSessionCost()).toBeCloseTo(0.00315, 6);
  });

  it("applies 25% surcharge on cache writes", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
    });

    // cache writes: 1M * $3/1M * 1.25 = $3.75
    expect(tracker.getSessionCost()).toBeCloseTo(3.75, 2);
  });

  it("handles combined base + cache read + cache write correctly", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 100_000,
      outputTokens: 50_000,
      cacheReadTokens: 80_000,
      cacheWriteTokens: 20_000,
    });

    // base input: 100K * $3/1M = $0.30
    // output: 50K * $15/1M = $0.75
    // cache reads: 80K * $3/1M * 0.1 = $0.024
    // cache writes: 20K * $3/1M * 1.25 = $0.075
    const expected = 0.3 + 0.75 + 0.024 + 0.075;
    expect(tracker.getSessionCost()).toBeCloseTo(expected, 4);
  });

  it("uses default pricing for unknown models", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("unknown/model-xyz", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    // default: input=$3/1M, output=$15/1M → $3 + $15 = $18
    expect(tracker.getSessionCost()).toBeCloseTo(18, 2);
  });

  it("accumulates across multiple calls", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    tracker.recordUsage("anthropic/claude-haiku-4-5", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });

    // haiku input: $0.8/1M * 2 = $1.60
    expect(tracker.getSessionCost()).toBeCloseTo(1.6, 2);
    expect(tracker.getTurnCount()).toBe(2);
    expect(tracker.getInputTokens()).toBe(2_000_000);
  });

  it("tracks cache stats separately", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 200,
      cacheWriteTokens: 300,
    });

    expect(tracker.getCacheStats()).toEqual({ reads: 200, writes: 300 });
  });

  it("resets all counters", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 100,
      cacheWriteTokens: 50,
    });

    tracker.reset();

    expect(tracker.getSessionCost()).toBe(0);
    expect(tracker.getTotalTokens()).toBe(0);
    expect(tracker.getTurnCount()).toBe(0);
    expect(tracker.getCacheStats()).toEqual({ reads: 0, writes: 0 });
  });

  it("returns formatted summary string", () => {
    const tracker = new CostTracker();
    tracker.recordUsage("anthropic/claude-sonnet-4-6", {
      inputTokens: 5000,
      outputTokens: 1000,
    });

    const summary = tracker.getSummary("anthropic/claude-sonnet-4-6");
    expect(summary).toContain("6,000 tokens");
    expect(summary).toContain("$");
    expect(summary).toContain("1 turns");
  });
});
