import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../src/llm/anthropic.js";
import type { StreamEvent } from "../../src/llm/types.js";

function makeAnthropicStream(events: unknown[], finalMessage: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: vi.fn().mockResolvedValue(finalMessage),
  };
}

describe("AnthropicProvider", () => {
  it("passes thinking/cache config and parses thinking/tool content", async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [
        { type: "thinking", thinking: "First think." },
        { type: "text", text: "Done." },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "read",
          input: { file_path: "src/index.ts" },
        },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 150,
        output_tokens: 50,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 30,
      },
    });

    const provider = new AnthropicProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      messages: {
        create: createMock,
        stream: vi.fn(),
      },
    };

    const response = await provider.createMessage({
      model: "anthropic/claude-sonnet-4-6",
      systemPrompt: "You are BombaCode.",
      messages: [{ role: "user", content: "Read a file." }],
      thinking: { enabled: true, budgetTokens: 1200 },
      tools: [
        {
          name: "read",
          description: "read file",
          inputSchema: {
            type: "object",
            properties: {
              file_path: { type: "string" },
            },
            required: ["file_path"],
          },
        },
      ],
      maxTokens: 4096,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [payload] = createMock.mock.calls[0];

    expect(payload.system).toEqual([
      {
        type: "text",
        text: "You are BombaCode.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(payload.thinking).toEqual({ type: "enabled", budget_tokens: 1200 });
    expect(payload.temperature).toBe(1); // Anthropic requires temp=1 with thinking
    expect(payload.tools).toHaveLength(1);

    expect(response.content).toBe("Done.");
    expect(response.thinkingContent).toBe("First think.");
    expect(response.stopReason).toBe("tool_use");
    expect(response.toolCalls).toEqual([
      {
        id: "toolu_1",
        name: "read",
        input: { file_path: "src/index.ts" },
      },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 150,
      outputTokens: 50,
      cacheReadTokens: 40,
      cacheWriteTokens: 30,
    });
  });

  it("streams tool/text events and final usage", async () => {
    const streamMock = vi.fn().mockReturnValue(
      makeAnthropicStream(
        [
          {
            type: "content_block_start",
            content_block: { type: "tool_use", id: "toolu_2", name: "edit" },
          },
          {
            type: "content_block_delta",
            delta: { type: "input_json_delta", partial_json: '{"file_path":"a.ts"}' },
          },
          { type: "content_block_stop" },
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Applied edit." },
          },
        ],
        {
          usage: {
            input_tokens: 80,
            output_tokens: 20,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 12,
          },
          stop_reason: "tool_use",
        }
      )
    );

    const provider = new AnthropicProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      messages: {
        create: vi.fn(),
        stream: streamMock,
      },
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.streamMessage({
      model: "anthropic/claude-sonnet-4-6",
      systemPrompt: "You are BombaCode.",
      messages: [{ role: "user", content: "edit file" }],
      thinking: { enabled: true, budgetTokens: 1500 },
      maxTokens: 4096,
    })) {
      events.push(event);
    }

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [payload] = streamMock.mock.calls[0];
    expect(payload.system).toEqual([
      {
        type: "text",
        text: "You are BombaCode.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(payload.thinking).toEqual({ type: "enabled", budget_tokens: 1500 });
    expect(payload.temperature).toBe(1); // Anthropic requires temp=1 with thinking

    expect(events).toContainEqual({
      type: "tool_call_start",
      toolCall: { id: "toolu_2", name: "edit" },
    });
    expect(events).toContainEqual({ type: "text_delta", content: "Applied edit." });
    expect(events).toContainEqual({
      type: "tool_call_end",
      toolCall: { id: "toolu_2", name: "edit", input: { file_path: "a.ts" } },
    });
    expect(events).toContainEqual({
      type: "usage",
      usage: {
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 10,
        cacheWriteTokens: 12,
      },
    });
    expect(events[events.length - 1]).toEqual({ type: "done", stopReason: "tool_use" });
  });

  it("exposes provider capability helpers", () => {
    const provider = new AnthropicProvider("test-key");

    expect(provider.supportsTools()).toBe(true);
    expect(provider.supportsThinking()).toBe(true);
    expect(provider.supportsCaching()).toBe(true);
    expect(provider.getMaxContextTokens("anthropic/claude-sonnet-4-6")).toBe(200_000);
    expect(provider.estimateTokens("hello world")).toBeGreaterThan(0);
  });
});
