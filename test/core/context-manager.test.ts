import { describe, expect, it, vi } from "vitest";
import { ContextManager } from "../../src/core/context-manager.js";
import { MessageManager } from "../../src/core/message-manager.js";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent } from "../../src/llm/types.js";
import { logger } from "../../src/utils/logger.js";

class MockSummaryProvider implements LLMProvider {
  name = "mock-summary";
  createCalls = 0;

  supportsTools(): boolean {
    return false;
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
    this.createCalls += 1;
    return {
      content: "Summary of earlier coding context.",
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 20 },
    };
  }

  async *streamMessage(_request: LLMRequest): AsyncGenerator<StreamEvent> {
    yield { type: "done", stopReason: "end_turn" };
  }

  getMaxContextTokens(_model: string): number {
    return 200_000;
  }
}

function seedConversation(manager: MessageManager, count: number, contentSize = 120): void {
  manager.addUserMessage(`initial task ${"x".repeat(contentSize)}`);

  for (let index = 1; index < count; index += 1) {
    if (index % 2 === 0) {
      manager.addUserMessage(`user-${index} ${"y".repeat(contentSize)}`);
    } else {
      manager.addAssistantMessage(`assistant-${index} ${"z".repeat(contentSize)}`);
    }
  }
}

describe("ContextManager", () => {
  it("calculates available budget and trigger", () => {
    const provider = new MockSummaryProvider();
    const manager = new MessageManager();

    const contextManager = new ContextManager({
      provider,
      messageManager: manager,
      model: "anthropic/claude-haiku-4-5",
      maxContextTokens: 200_000,
      reservedOutputTokens: 40_000,
      systemPromptTokens: 2_000,
      toolDefinitionTokens: 3_000,
      compactThreshold: 0.85,
    });

    expect(contextManager.getAvailableForMessages()).toBe(155_000);
    expect(contextManager.getCompactTrigger()).toBe(131_750);
  });

  it("ensureWithinBudget does nothing when under threshold", async () => {
    const provider = new MockSummaryProvider();
    const messageManager = new MessageManager();

    messageManager.addUserMessage("small prompt");
    messageManager.addAssistantMessage("small answer");

    const contextManager = new ContextManager({
      provider,
      messageManager,
      model: "anthropic/claude-haiku-4-5",
      maxContextTokens: 10_000,
      reservedOutputTokens: 1_000,
      systemPromptTokens: 500,
      toolDefinitionTokens: 500,
      compactThreshold: 0.85,
    });

    await contextManager.ensureWithinBudget();

    expect(provider.createCalls).toBe(0);
    expect(messageManager.getMessageCount()).toBe(2);
  });

  it("compacts conversation with summary while preserving pinned and recent messages", async () => {
    const provider = new MockSummaryProvider();
    const messageManager = new MessageManager();
    seedConversation(messageManager, 30, 180);

    const originalMessages = messageManager.getMessages();

    const contextManager = new ContextManager({
      provider,
      messageManager,
      model: "anthropic/claude-haiku-4-5",
      maxContextTokens: 2_000,
      reservedOutputTokens: 300,
      systemPromptTokens: 100,
      toolDefinitionTokens: 100,
      compactThreshold: 0.6,
    });

    await contextManager.compact();

    const compacted = messageManager.getMessages();

    expect(provider.createCalls).toBeGreaterThan(0);
    expect(compacted.length).toBeLessThan(originalMessages.length);
    expect(compacted[0]).toEqual(originalMessages[0]);
    expect(compacted.some((message) => message.role === "user" && message.content.includes("[Context summary]:"))).toBe(true);

    const recentWindow = originalMessages.slice(-10);
    for (const recentMessage of recentWindow) {
      expect(
        compacted.some((message) => message.role === recentMessage.role && message.content === recentMessage.content)
      ).toBe(true);
    }
  });

  it("ensureWithinBudget triggers compaction when threshold exceeded", async () => {
    const provider = new MockSummaryProvider();
    const messageManager = new MessageManager();
    seedConversation(messageManager, 24, 200);

    const contextManager = new ContextManager({
      provider,
      messageManager,
      model: "anthropic/claude-haiku-4-5",
      maxContextTokens: 1_800,
      reservedOutputTokens: 400,
      systemPromptTokens: 100,
      toolDefinitionTokens: 100,
      compactThreshold: 0.5,
    });

    await contextManager.ensureWithinBudget();

    expect(provider.createCalls).toBeGreaterThan(0);
    expect(messageManager.getMessages().some((message) => message.content.includes("[Context summary]:"))).toBe(true);
  });

  it("logs accurate before and after token snapshots", async () => {
    const provider = new MockSummaryProvider();
    const messageManager = new MessageManager();
    seedConversation(messageManager, 20, 200);

    const contextManager = new ContextManager({
      provider,
      messageManager,
      model: "anthropic/claude-haiku-4-5",
      maxContextTokens: 1_600,
      reservedOutputTokens: 300,
      systemPromptTokens: 100,
      toolDefinitionTokens: 100,
      compactThreshold: 0.5,
    });

    const beforeTokens = messageManager.getEstimatedTokens();
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

    await contextManager.compact();

    const afterTokens = messageManager.getEstimatedTokens();
    const compactLogCall = infoSpy.mock.calls.find(
      (call) => call[0] === "Context compacted"
    );

    expect(compactLogCall).toBeDefined();
    const payload = compactLogCall?.[1] as
      | { beforeTokens: number; afterTokens: number; beforeMessages: number; afterMessages: number }
      | undefined;

    expect(payload?.beforeTokens).toBe(beforeTokens);
    expect(payload?.afterTokens).toBe(afterTokens);
    expect(payload?.beforeMessages).toBe(20);
    expect(payload?.afterMessages).toBe(messageManager.getMessageCount());

    infoSpy.mockRestore();
  });
});
