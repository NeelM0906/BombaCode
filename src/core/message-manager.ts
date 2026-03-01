import type { Message, ToolCall, ToolResult } from "../llm/types.js";
import { TokenCounter } from "../llm/token-counter.js";

export class MessageManager {
  private messages: Message[] = [];
  private tokenCounter: TokenCounter;
  private pinnedIndices: Set<number> = new Set();

  constructor() {
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
    if (this.messages.length === 1) {
      this.pinnedIndices.add(0);
    }
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(content: string, toolCalls?: ToolCall[]): void {
    if (toolCalls && toolCalls.length > 0) {
      this.messages.push({ role: "assistant", content, toolCalls });
    } else {
      this.messages.push({ role: "assistant", content });
    }
  }

  /**
   * Add a tool result message
   */
  addToolResult(toolUseId: string, content: string): void {
    this.messages.push({ role: "tool", toolUseId, content });
  }

  /**
   * Add a structured tool result
   */
  addToolExecutionResult(result: ToolResult): void {
    this.messages.push({ role: "tool", toolUseId: result.toolUseId, content: result.content });
  }

  /**
   * Get a copy of all messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Replace all messages directly (used by context compaction and session resume)
   */
  setMessages(messages: Message[]): void {
    this.messages = [...messages];

    const nextPins = new Set<number>();
    for (const index of this.pinnedIndices) {
      if (index >= 0 && index < this.messages.length) {
        nextPins.add(index);
      }
    }

    if (this.messages.length > 0) {
      nextPins.add(0);
    }

    this.pinnedIndices = nextPins;
  }

  /**
   * Get the number of messages
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Get the last assistant message content
   */
  getLastAssistantMessage(): string | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg && msg.role === "assistant") {
        return msg.content;
      }
    }
    return undefined;
  }

  /**
   * Get estimated token count for all messages
   */
  getEstimatedTokens(): number {
    return this.tokenCounter.estimateMessages(this.messages);
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.pinnedIndices.clear();
  }

  /**
   * Get the last N messages
   */
  getLastMessages(n: number): Message[] {
    return this.messages.slice(-n);
  }

  /**
   * Remove oldest non-pinned messages until the estimated tokens are within target
   */
  truncate(targetTokens: number): Message[] {
    const removed: Message[] = [];
    const safeTarget = Math.max(0, targetTokens);

    while (this.getEstimatedTokens() > safeTarget) {
      const removableIndex = this.findOldestRemovableIndex();
      if (removableIndex === -1) {
        break;
      }

      const [removedMessage] = this.messages.splice(removableIndex, 1);
      if (removedMessage) {
        removed.push(removedMessage);
      }
      this.remapPinnedIndicesAfterRemoval(removableIndex);
    }

    return removed;
  }

  /**
   * Replace a range of messages with a single summary message
   */
  summarize(startIdx: number, endIdx: number, summaryContent: string): void {
    if (startIdx < 0 || endIdx < 0 || startIdx >= this.messages.length || endIdx >= this.messages.length) {
      throw new Error("Summary range is out of bounds");
    }

    if (startIdx > endIdx) {
      throw new Error("Summary range is invalid");
    }

    const removedCount = endIdx - startIdx + 1;
    const hadPinnedInRange = this.hasPinnedInRange(startIdx, endIdx);

    this.messages.splice(
      startIdx,
      removedCount,
      { role: "user", content: `[Context summary]: ${summaryContent}` }
    );

    const shiftedPins = new Set<number>();
    for (const index of this.pinnedIndices) {
      if (index < startIdx) {
        shiftedPins.add(index);
        continue;
      }

      if (index > endIdx) {
        shiftedPins.add(index - (removedCount - 1));
      }
    }

    if (hadPinnedInRange) {
      shiftedPins.add(startIdx);
    }

    if (this.messages.length > 0) {
      shiftedPins.add(0);
    }

    this.pinnedIndices = shiftedPins;
  }

  /**
   * Pin a message index so truncate/compact never removes it
   */
  pin(index: number): void {
    if (index < 0 || index >= this.messages.length) {
      throw new Error(`Cannot pin index ${index}: out of bounds`);
    }
    this.pinnedIndices.add(index);
  }

  /**
   * Check whether a message index is pinned
   */
  isPinned(index: number): boolean {
    return this.pinnedIndices.has(index);
  }

  /**
   * Estimate tokens for an inclusive message range
   */
  getEstimatedTokensForRange(start: number, end: number): number {
    if (start < 0 || end < 0 || start >= this.messages.length || end >= this.messages.length) {
      throw new Error("Token range is out of bounds");
    }

    if (start > end) {
      return 0;
    }

    return this.tokenCounter.estimateMessages(this.messages.slice(start, end + 1));
  }

  private findOldestRemovableIndex(): number {
    for (let index = 0; index < this.messages.length; index += 1) {
      if (!this.pinnedIndices.has(index)) {
        return index;
      }
    }
    return -1;
  }

  private remapPinnedIndicesAfterRemoval(removedIndex: number): void {
    const next = new Set<number>();

    for (const index of this.pinnedIndices) {
      if (index < removedIndex) {
        next.add(index);
      } else if (index > removedIndex) {
        next.add(index - 1);
      }
    }

    if (this.messages.length > 0) {
      next.add(0);
    }

    this.pinnedIndices = next;
  }

  private hasPinnedInRange(start: number, end: number): boolean {
    for (const index of this.pinnedIndices) {
      if (index >= start && index <= end) {
        return true;
      }
    }
    return false;
  }
}
