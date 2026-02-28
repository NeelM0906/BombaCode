import { describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../../src/llm/openrouter.js";
import type { LLMRequest, StreamEvent } from "../../src/llm/types.js";

function asAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe("OpenRouterProvider", () => {
  it("maps request/response with tools for createMessage", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "Let me search.",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "grep",
                  arguments: '{"pattern":"TODO"}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 30,
      },
    });

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const response = await provider.createMessage({
      model: "anthropic/claude-sonnet-4-6",
      systemPrompt: "You are BombaCode.",
      messages: [{ role: "user", content: "Find TODOs" }],
      tools: [
        {
          name: "grep",
          description: "search files",
          inputSchema: { type: "object", properties: { pattern: { type: "string" } } },
        },
      ],
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [payload] = createMock.mock.calls[0];
    expect(payload.model).toBe("anthropic/claude-sonnet-4-6");
    expect(payload.messages[0]).toEqual({ role: "system", content: "You are BombaCode." });
    expect(payload.tools).toHaveLength(1);
    expect(payload.tools[0].type).toBe("function");

    expect(response.content).toBe("Let me search.");
    expect(response.stopReason).toBe("tool_use");
    expect(response.toolCalls).toEqual([
      { id: "call_1", name: "grep", input: { pattern: "TODO" } },
    ]);
    expect(response.usage).toEqual({ inputTokens: 200, outputTokens: 30 });
  });

  it("maps finish_reason=length to max_tokens stopReason", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: "length",
          message: { content: "Truncated...", tool_calls: [] },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 4096 },
    });

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const response = await provider.createMessage({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Write a long essay" }],
    });

    expect(response.stopReason).toBe("max_tokens");
  });

  it("streams text and tool events", async () => {
    const createMock = vi.fn().mockResolvedValue(
      asAsyncIterable([
        { choices: [{ delta: { content: "Hello " } }] },
        { choices: [{ delta: { content: "world" } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_2",
                    function: { name: "read", arguments: '{"file_path":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"src/index.ts"}' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 50, completion_tokens: 10 },
        },
      ])
    );

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.streamMessage({
      model: "anthropic/claude-sonnet-4-6",
      messages: [{ role: "user", content: "Read index" }],
      tools: [
        {
          name: "read",
          description: "read file",
          inputSchema: { type: "object", properties: { file_path: { type: "string" } } },
        },
      ],
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "text_delta", content: "Hello " });
    expect(events).toContainEqual({ type: "text_delta", content: "world" });
    expect(events).toContainEqual({
      type: "tool_call_start",
      toolCall: { id: "call_2", name: "read" },
    });

    const toolEnd = events.find((e) => e.type === "tool_call_end");
    expect(toolEnd).toEqual({
      type: "tool_call_end",
      toolCall: { id: "call_2", name: "read", input: { file_path: "src/index.ts" } },
    });

    expect(events).toContainEqual({
      type: "usage",
      usage: { inputTokens: 50, outputTokens: 10 },
    });
    expect(events[events.length - 1]).toEqual({ type: "done" });
  });

  it("exposes provider capabilities", () => {
    const provider = new OpenRouterProvider("test-key");

    expect(provider.supportsTools()).toBe(true);
    expect(provider.supportsThinking()).toBe(false);
    expect(provider.supportsCaching()).toBe(false);
    expect(provider.name).toBe("openrouter");
    expect(provider.getMaxContextTokens("anthropic/claude-sonnet-4-6")).toBe(200_000);
    expect(provider.getMaxContextTokens("unknown/model")).toBe(128_000);
    expect(provider.estimateTokens("hello world")).toBeGreaterThan(0);
  });
});
