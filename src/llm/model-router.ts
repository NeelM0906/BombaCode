import type { Settings } from "../memory/settings.js";
import type { CostTracker } from "./cost-tracker.js";
import { logger } from "../utils/logger.js";

// High complexity keywords suggest tasks requiring a powerful model
const HIGH_COMPLEXITY_KEYWORDS = [
  "refactor",
  "architect",
  "design",
  "implement",
  "migrate",
  "rewrite",
  "redesign",
  "optimize",
  "debug",
  "integrate",
];

// Low complexity keywords suggest simple tasks suitable for a fast model
const LOW_COMPLEXITY_KEYWORDS = [
  "fix typo",
  "rename",
  "add comment",
  "format",
  "remove",
  "delete",
  "update version",
  "bump",
  "add import",
  "fix lint",
];

/**
 * Estimate the complexity of a user message on a scale of 1-10.
 * Used in balanced mode to route between fast/balanced/powerful models.
 */
export function estimateComplexity(message: string): number {
  let score = 5; // baseline

  const lower = message.toLowerCase();

  // Check for high-complexity keywords
  for (const keyword of HIGH_COMPLEXITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 2;
      break; // only count once
    }
  }

  // Check for low-complexity keywords
  for (const keyword of LOW_COMPLEXITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      score -= 2;
      break;
    }
  }

  // Message length factor: longer messages tend to be more complex
  if (message.length > 500) {
    score += 1;
  }
  if (message.length > 1500) {
    score += 1;
  }
  if (message.length < 50) {
    score -= 1;
  }

  // File mentions: more files mentioned = more complex
  const filePatterns = message.match(/[\w\-/]+\.\w{1,5}/g);
  const fileCount = filePatterns?.length ?? 0;
  if (fileCount >= 3) {
    score += 1;
  }
  if (fileCount >= 6) {
    score += 1;
  }

  // Code blocks suggest concrete code work
  const codeBlocks = (message.match(/```/g) ?? []).length / 2;
  if (codeBlocks >= 1) {
    score += 1;
  }

  // Clamp to 1-10
  return Math.max(1, Math.min(10, score));
}

export interface ModelRouterContext {
  /** The latest user message, used for complexity estimation */
  userMessage?: string;
  /** Cost tracker for budget-aware routing */
  costTracker?: CostTracker;
}

/** Default fallback chain: sonnet -> haiku as a cheap fallback */
const DEFAULT_FALLBACK_CHAIN = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-haiku-4-5",
];

export class ModelRouter {
  private fallbackChain: string[] = DEFAULT_FALLBACK_CHAIN;

  /**
   * Select the optimal model based on cost mode, complexity, and budget.
   * Backward compatible: works with just settings, but accepts optional context.
   */
  select(settings: Settings, context?: ModelRouterContext): string {
    const { costTracker, userMessage } = context ?? {};

    // Budget-aware downgrade: if session cost > 90% of maxBudget, use fast model
    if (costTracker && settings.maxTokenBudget != null && settings.maxTokenBudget > 0) {
      const currentCost = costTracker.getSessionCost();
      if (currentCost > settings.maxTokenBudget * 0.9) {
        logger.info("Budget threshold exceeded, switching to fast model", {
          currentCost,
          maxBudget: settings.maxTokenBudget,
        });
        return settings.models.fast;
      }
    }

    // Fixed modes: quality-first always picks powerful, cost-first always picks fast
    switch (settings.costMode) {
      case "quality-first":
        return settings.models.powerful;
      case "cost-first":
        return settings.models.fast;
    }

    // Balanced mode: use complexity estimation
    if (userMessage) {
      const complexity = estimateComplexity(userMessage);
      if (complexity < 4) {
        return settings.models.fast;
      }
      if (complexity < 7) {
        return settings.models.balanced;
      }
      return settings.models.powerful;
    }

    // Default balanced
    return settings.models.balanced;
  }

  /**
   * Get the next fallback model after a failure.
   * Returns null if no more fallbacks are available.
   */
  getNextFallback(failedModel: string, settings: Settings): string | null {
    // Build a chain from settings models + configured fallback chain
    const chain = [
      settings.models.powerful,
      settings.models.balanced,
      settings.models.fast,
      ...this.fallbackChain,
    ];

    // Deduplicate while preserving order
    const unique = [...new Set(chain)];

    const failedIndex = unique.indexOf(failedModel);
    if (failedIndex === -1) {
      // Unknown model failed, try the first in chain
      return unique[0] ?? null;
    }

    // Return the next model in the chain
    const next = unique[failedIndex + 1];
    return next ?? null;
  }

  /**
   * Check if an error is retriable (429, 500+, timeout).
   */
  isRetriableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Rate limit
    if (message.includes("429") || message.includes("rate limit")) {
      return true;
    }

    // Server errors
    if (message.includes("500") || message.includes("502") || message.includes("503")) {
      return true;
    }

    // Timeout
    if (message.includes("timeout") || message.includes("timed out")) {
      return true;
    }

    return false;
  }

  /**
   * Set a custom fallback chain.
   */
  setFallbackChain(chain: string[]): void {
    this.fallbackChain = chain;
  }
}
