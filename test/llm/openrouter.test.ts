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
    // Claude model: system prompt should be multipart with cache_control
    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "You are BombaCode.", cache_control: { type: "ephemeral" } },
    ]);
    expect(payload.tools).toHaveLength(1);
    expect(payload.tools[0].type).toBe("function");
    // Claude model: last tool should have cache_control
    expect(payload.tools[0].function.cache_control).toEqual({ type: "ephemeral" });

    expect(response.content).toBe("Let me search.");
    expect(response.stopReason).toBe("tool_use");
    expect(response.toolCalls).toEqual([
      { id: "call_1", name: "grep", input: { pattern: "TODO" } },
    ]);
    expect(response.usage).toEqual({
      inputTokens: 200,
      outputTokens: 30,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    });
  });

  it("applies cache_control to last tool message for Claude models", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Here is the result.", tool_calls: [] },
        },
      ],
      usage: { prompt_tokens: 300, completion_tokens: 20 },
    });

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    await provider.createMessage({
      model: "anthropic/claude-sonnet-4-6",
      systemPrompt: "You are BombaCode.",
      messages: [
        { role: "user", content: "Read the file" },
        {
          role: "assistant",
          content: "I'll read that file.",
          toolCalls: [
            { id: "call_1", name: "read", input: { file_path: "src/index.ts" } },
          ],
        },
        { role: "tool", toolUseId: "call_1", content: "file contents here" },
      ],
    });

    const [payload] = createMock.mock.calls[0];
    // Last message is a tool result — it should have cache_control for Claude models
    const lastMsg = payload.messages[payload.messages.length - 1];
    expect(lastMsg.role).toBe("tool");
    expect(lastMsg.cache_control).toEqual({ type: "ephemeral" });
  });

  it("does not apply cache_control to last tool message for non-Claude models", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Done.", tool_calls: [] },
        },
      ],
      usage: { prompt_tokens: 150, completion_tokens: 10 },
    });

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    await provider.createMessage({
      model: "openai/gpt-4o",
      messages: [
        { role: "user", content: "Read the file" },
        {
          role: "assistant",
          content: "Reading.",
          toolCalls: [
            { id: "call_1", name: "read", input: { file_path: "src/index.ts" } },
          ],
        },
        { role: "tool", toolUseId: "call_1", content: "file contents here" },
      ],
    });

    const [payload] = createMock.mock.calls[0];
    const lastMsg = payload.messages[payload.messages.length - 1];
    expect(lastMsg.role).toBe("tool");
    expect(lastMsg.cache_control).toBeUndefined();
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
      usage: { inputTokens: 50, outputTokens: 10, cacheReadTokens: undefined, cacheWriteTokens: undefined },
    });
    expect(events[events.length - 1]).toEqual({ type: "done", stopReason: "tool_use" });
  });

  it("maps streaming finish_reason=stop to done.stopReason=end_turn", async () => {
    const createMock = vi.fn().mockResolvedValue(
      asAsyncIterable([
        { choices: [{ delta: { content: "Short answer." } }] },
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 22, completion_tokens: 6 },
        },
      ])
    );

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.streamMessage({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Say hi" }],
    })) {
      events.push(event);
    }

    expect(events[events.length - 1]).toEqual({ type: "done", stopReason: "end_turn" });
  });

  it("maps streaming finish_reason=length to done.stopReason=max_tokens", async () => {
    const createMock = vi.fn().mockResolvedValue(
      asAsyncIterable([
        { choices: [{ delta: { content: "Long answer..." } }] },
        {
          choices: [{ delta: {}, finish_reason: "length" }],
          usage: { prompt_tokens: 120, completion_tokens: 4096 },
        },
      ])
    );

    const provider = new OpenRouterProvider("test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: { completions: { create: createMock } },
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.streamMessage({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "Generate a huge response" }],
    })) {
      events.push(event);
    }

    expect(events[events.length - 1]).toEqual({ type: "done", stopReason: "max_tokens" });
  });

  it("exposes provider capabilities", () => {
    const provider = new OpenRouterProvider("test-key");

    expect(provider.supportsTools()).toBe(true);
    expect(provider.supportsThinking()).toBe(false);
    expect(provider.supportsCaching()).toBe(true);
    expect(provider.name).toBe("openrouter");
    expect(provider.getMaxContextTokens("anthropic/claude-sonnet-4-6")).toBe(200_000);
    expect(provider.getMaxContextTokens("unknown/model")).toBe(128_000);
    expect(provider.estimateTokens("hello world")).toBeGreaterThan(0);
  });
});
