import { describe, expect, it } from "vitest";
import { AgentLoop } from "../../src/core/agent-loop.js";
import { MessageManager } from "../../src/core/message-manager.js";
import { CostTracker } from "../../src/llm/cost-tracker.js";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent } from "../../src/llm/types.js";

class FakeProvider implements LLMProvider {
  name = "fake";

  supportsTools(): boolean {
    return true;
  }

  supportsThinking(): boolean {
    return false;
  }

  supportsCaching(): boolean {
    return false;
  }

  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async createMessage(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: "hello",
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }

  async *streamMessage(_request: LLMRequest): AsyncGenerator<StreamEvent> {
    yield { type: "text_delta", content: "hello" };
    yield { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } };
    yield { type: "done" };
  }

  getMaxContextTokens(): number {
    return 100_000;
  }
}

describe("AgentLoop", () => {
  it("streams text and stores assistant response", async () => {
    const messageManager = new MessageManager();
    const costTracker = new CostTracker();
    const chunks: string[] = [];

    const loop = new AgentLoop({
      messageManager,
      provider: new FakeProvider(),
      costTracker,
      model: "anthropic/claude-sonnet-4-6",
      onStreamDelta: (text) => chunks.push(text),
    });

    const response = await loop.processUserInput("hi");

    expect(response).toBe("hello");
    expect(chunks.join("")).toBe("hello");
    expect(messageManager.getMessageCount()).toBe(2);
    expect(costTracker.getTotalTokens()).toBe(15);
  });
});
