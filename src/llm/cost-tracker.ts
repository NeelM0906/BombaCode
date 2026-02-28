import type { TokenUsage } from "./types.js";

// Prices per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-4-6": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
  "anthropic/claude-haiku-4-5": { input: 0.8, output: 4 },
  // Anthropic via OpenRouter
  "anthropic/claude-opus-4-5-20251101": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "anthropic/claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  // Direct Anthropic (same models, no prefix)
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-opus-4-5-20251101": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  // OpenAI via OpenRouter
  "openai/gpt-5": { input: 5, output: 15 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/o3-mini": { input: 1.1, output: 4.4 },
  // Google via OpenRouter
  "google/gemini-2.5-pro-preview": { input: 1.25, output: 10 },
  "google/gemini-2.0-flash": { input: 0.1, output: 0.4 },
  // Meta via OpenRouter
  "meta-llama/llama-4-maverick": { input: 0.2, output: 0.6 },
  // DeepSeek via OpenRouter
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
  "deepseek/deepseek-chat": { input: 0.27, output: 1.1 },
};

// Default pricing when model is not in the table
const DEFAULT_PRICING = { input: 3, output: 15 };

export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCacheReadTokens = 0;
  private totalCacheWriteTokens = 0;
  private totalCost = 0;
  private turnCount = 0;

  /**
   * Record usage from a single LLM call
   */
  recordUsage(model: string, usage: TokenUsage): void {
    this.totalInputTokens += usage.inputTokens;
    this.totalOutputTokens += usage.outputTokens;
    this.totalCacheReadTokens += usage.cacheReadTokens ?? 0;
    this.totalCacheWriteTokens += usage.cacheWriteTokens ?? 0;
    this.turnCount++;

    const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
    const cost =
      (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;

    // Cache reads are 90% cheaper
    if (usage.cacheReadTokens) {
      const cacheDiscount = (usage.cacheReadTokens * pricing.input * 0.9) / 1_000_000;
      this.totalCost += cost - cacheDiscount;
    } else {
      this.totalCost += cost;
    }
  }

  getSessionCost(): number {
    return this.totalCost;
  }

  getTotalTokens(): number {
    return this.totalInputTokens + this.totalOutputTokens;
  }

  getInputTokens(): number {
    return this.totalInputTokens;
  }

  getOutputTokens(): number {
    return this.totalOutputTokens;
  }

  getCacheStats(): { reads: number; writes: number } {
    return { reads: this.totalCacheReadTokens, writes: this.totalCacheWriteTokens };
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Get a formatted summary string
   */
  getSummary(model: string): string {
    const total = this.getTotalTokens();
    const cost = this.getSessionCost();
    return `${total.toLocaleString()} tokens | $${cost.toFixed(4)} | ${this.turnCount} turns`;
  }

  /**
   * Reset all counters
   */
  reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCacheReadTokens = 0;
    this.totalCacheWriteTokens = 0;
    this.totalCost = 0;
    this.turnCount = 0;
  }
}
