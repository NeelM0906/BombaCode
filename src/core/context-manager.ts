import type { Message } from "../llm/types.js";

export interface ContextBudget {
  maxTokens: number;
  compactAt: number;
}

export class ContextManager {
  constructor(private readonly budget: ContextBudget) {}

  shouldCompact(currentTokens: number): boolean {
    return currentTokens >= this.budget.maxTokens * this.budget.compactAt;
  }

  compact(messages: Message[]): Message[] {
    if (messages.length <= 20) {
      return messages;
    }
    return messages.slice(-20);
  }
}
