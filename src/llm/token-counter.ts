import { encodingForModel } from "js-tiktoken";
import type { Message } from "./types.js";

let cachedEncoding: ReturnType<typeof encodingForModel> | null = null;

function getEncoding() {
  if (!cachedEncoding) {
    try {
      cachedEncoding = encodingForModel("gpt-4o");
    } catch {
      // Fallback: will use char-based estimation
      return null;
    }
  }
  return cachedEncoding;
}

export class TokenCounter {
  /**
   * Estimate token count for a string
   * Uses tiktoken for accuracy, falls back to char-based heuristic
   */
  estimateTokens(text: string): number {
    const enc = getEncoding();
    if (enc) {
      try {
        const tokens = enc.encode(text);
        return tokens.length;
      } catch {
        // Fallback
      }
    }
    // Heuristic: ~4 chars per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate total tokens for a message array
   * Includes per-message overhead (~4 tokens per role/separator)
   */
  estimateMessages(messages: Message[]): number {
    let total = 0;
    for (const msg of messages) {
      total += 4; // role + formatting overhead
      if (msg.role === "user" || msg.role === "assistant") {
        total += this.estimateTokens(msg.content);
      } else if (msg.role === "tool") {
        total += this.estimateTokens(msg.content);
        total += 2; // tool_use_id overhead
      }

      // Tool calls add extra tokens
      if (msg.role === "assistant" && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          total += this.estimateTokens(tc.name);
          total += this.estimateTokens(JSON.stringify(tc.input));
          total += 10; // tool call formatting overhead
        }
      }
    }
    total += 3; // assistant priming
    return total;
  }
}
