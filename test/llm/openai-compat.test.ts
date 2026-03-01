import { describe, expect, it, vi } from "vitest";
import { OpenAICompatProvider } from "../../src/llm/openai-compat.js";
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

describe("OpenAICompatProvider", () => {
  it("maps request/response with tools for createMessage", async () => {
    const createMock = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I'll use a tool.",
            tool_calls: [
              {
                id: "call_2",
                type: "function",
                function: {
                  name: "grep",
                  arguments: '{"pattern":"AgentLoop"}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 42,
        completion_tokens: 9,
      },
    });

    const provider = new OpenAICompatProvider("http://localhost:4000/v1", "test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: createMock,
        },
      },
    };

    const request: LLMRequest = {
      model: "openai/gpt-5",
      systemPrompt: "You are a coding agent.",
      messages: [
        { role: "user", content: "Search for AgentLoop" },
        {
          role: "assistant",
          content: "Calling tool",
          toolCalls: [{ id: "call_1", name: "read", input: { file_path: "src/core/agent-loop.ts" } }],
        },
        { role: "tool", toolUseId: "call_1", content: "1\timport ..." },
      ],
      tools: [
        {
          name: "grep",
          description: "search content",
          inputSchema: {
            type: "object",
            properties: {
              pattern: { type: "string" },
            },
            required: ["pattern"],
          },
        },
      ],
      maxTokens: 1024,
    };

    const response = await provider.createMessage(request);

    expect(createMock).toHaveBeenCalledTimes(1);
    const [payload] = createMock.mock.calls[0];
    expect(payload.model).toBe("openai/gpt-5");
    expect(payload.tools).toHaveLength(1);
    expect(payload.messages.some((msg: { role: string }) => msg.role === "tool")).toBe(true);

    expect(response.content).toBe("I'll use a tool.");
    expect(response.stopReason).toBe("tool_use");
    expect(response.toolCalls).toEqual([
      {
        id: "call_2",
        name: "grep",
        input: { pattern: "AgentLoop" },
      },
    ]);
    expect(response.usage).toEqual({ inputTokens: 42, outputTokens: 9 });
  });

  it("streams text/tool events and usage", async () => {
    const createMock = vi.fn().mockResolvedValue(
      asAsyncIterable([
        {
          choices: [{ delta: { content: "Running command" } }],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_3",
                    function: { name: "bash", arguments: '{"command":"ls' },
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
                    function: { arguments: ' -la"}' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [{ delta: {} }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
          },
        },
      ])
    );

    const provider = new OpenAICompatProvider("http://localhost:4000/v1", "test-key");
    (provider as unknown as { client: unknown }).client = {
      chat: {
        completions: {
          create: createMock,
        },
      },
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.streamMessage({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "run ls" }],
      tools: [
        {
          name: "bash",
          description: "run shell command",
          inputSchema: { type: "object", properties: { command: { type: "string" } } },
        },
      ],
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: "text_delta", content: "Running command" });
    expect(events).toContainEqual({ type: "tool_call_start", toolCall: { id: "call_3", name: "bash" } });

    const toolEnd = events.find((event) => event.type === "tool_call_end");
    expect(toolEnd).toEqual({
      type: "tool_call_end",
      toolCall: {
        id: "call_3",
        name: "bash",
        input: { command: "ls -la" },
      },
    });

    expect(events).toContainEqual({
      type: "usage",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(events[events.length - 1]).toEqual({ type: "done", stopReason: "tool_use" });
  });

  it("exposes provider capability helpers", () => {
    const provider = new OpenAICompatProvider("http://localhost:4000/v1", "test-key");

    expect(provider.supportsTools()).toBe(true);
    expect(provider.supportsThinking()).toBe(false);
    expect(provider.supportsCaching()).toBe(false);
    expect(provider.getMaxContextTokens("openai/gpt-5")).toBe(400_000);
    expect(provider.estimateTokens("hello world")).toBeGreaterThan(0);
  });
});
