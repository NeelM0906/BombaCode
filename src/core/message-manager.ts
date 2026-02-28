import type { Message, ToolCall, ToolResult } from "../llm/types.js";
import { TokenCounter } from "../llm/token-counter.js";

export class MessageManager {
  private messages: Message[] = [];
  private tokenCounter: TokenCounter;

  constructor() {
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
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
  }

  /**
   * Get the last N messages
   */
  getLastMessages(n: number): Message[] {
    return this.messages.slice(-n);
  }
}
