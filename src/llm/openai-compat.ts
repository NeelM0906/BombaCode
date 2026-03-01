import OpenAI from "openai";
import { withCancellation, withRetry, parseToolArguments } from "./streaming.js";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent, ToolCall, TokenUsage } from "./types.js";

const MODEL_CONTEXT: Record<string, number> = {
  "gpt-5": 400_000,
  "gpt-5-mini": 400_000,
  "gpt-5-nano": 400_000,
  "gpt-4.1": 1_000_000,
  "gpt-4.1-mini": 1_000_000,
  "gpt-4o": 128_000,
  "o3": 200_000,
  "o3-mini": 200_000,
  "o4-mini": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-6": 200_000,
  "claude-haiku-4-5": 200_000,
  "deepseek-r1": 64_000,
};

export class OpenAICompatProvider implements LLMProvider {
  name = "openai-compat";
  private readonly client: OpenAI;

  constructor(baseURL: string, apiKey?: string, client?: OpenAI) {
    this.client =
      client ??
      new OpenAI({
        baseURL,
        apiKey: apiKey || "not-required",
      });
  }

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

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const messages = this.buildMessages(request);
    const tools = request.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const response = await withRetry(async () => {
      return this.client.chat.completions.create(
        {
          model: request.model,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0,
        },
        { signal: request.abortSignal }
      );
    }, request.abortSignal);

    const choice = response.choices[0];
    const toolCalls = this.parseToolCalls(choice?.message?.tool_calls);

    const usage: TokenUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    const stopReason =
      choice?.finish_reason === "tool_calls"
        ? "tool_use"
        : choice?.finish_reason === "length"
          ? "max_tokens"
          : "end_turn";

    return {
      content: choice?.message?.content ?? "",
      toolCalls,
      stopReason,
      usage,
    };
  }

  async *streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent> {
    const messages = this.buildMessages(request);
    const tools = request.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const stream = await withRetry(async () => {
      return this.client.chat.completions.create(
        {
          model: request.model,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: request.abortSignal }
      );
    }, request.abortSignal);

    const pendingToolCalls = new Map<number, { id: string; name: string; args: string; started: boolean }>();
    let usageEmitted = false;
    let stopReason: "end_turn" | "tool_use" | "max_tokens" = "end_turn";
    let sawToolCalls = false;

    for await (const chunk of withCancellation(stream, request.abortSignal)) {
      const delta = chunk.choices[0]?.delta;
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason) {
        stopReason = this.mapFinishReason(finishReason);
      }

      if (delta?.content) {
        yield { type: "text_delta", content: delta.content };
      }

      if (delta?.tool_calls) {
        for (const toolCallChunk of delta.tool_calls) {
          const index = toolCallChunk.index;
          if (typeof index !== "number") {
            continue;
          }

          if (!pendingToolCalls.has(index)) {
            pendingToolCalls.set(index, {
              id: "",
              name: "",
              args: "",
              started: false,
            });
          }

          const pending = pendingToolCalls.get(index)!;

          if (toolCallChunk.id) {
            pending.id = toolCallChunk.id;
          }

          if (toolCallChunk.function?.name) {
            pending.name = toolCallChunk.function.name;
          }

          if (!pending.started && pending.id && pending.name) {
            pending.started = true;
            yield {
              type: "tool_call_start",
              toolCall: {
                id: pending.id,
                name: pending.name,
              },
            };
          }

          if (toolCallChunk.function?.arguments) {
            pending.args += toolCallChunk.function.arguments;
            sawToolCalls = true;
            yield {
              type: "tool_call_delta",
              content: toolCallChunk.function.arguments,
            };
          }
        }
      }

      if (chunk.usage && !usageEmitted) {
        usageEmitted = true;
        yield {
          type: "usage",
          usage: {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          },
        };
      }
    }

    for (const pending of pendingToolCalls.values()) {
      if (!pending.started && pending.id && pending.name) {
        yield {
          type: "tool_call_start",
          toolCall: {
            id: pending.id,
            name: pending.name,
          },
        };
      }
      sawToolCalls = true;

      yield {
        type: "tool_call_end",
        toolCall: {
          id: pending.id,
          name: pending.name,
          input: parseToolArguments(pending.args),
        },
      };
    }

    if (stopReason === "end_turn" && sawToolCalls) {
      stopReason = "tool_use";
    }

    yield { type: "done", stopReason };
  }

  getMaxContextTokens(model: string): number {
    return MODEL_CONTEXT[model] ?? MODEL_CONTEXT[this.stripProviderPrefix(model)] ?? 128_000;
  }

  private parseToolCalls(
    toolCalls: OpenAI.ChatCompletionMessageToolCall[] | undefined
  ): ToolCall[] {
    if (!toolCalls || toolCalls.length === 0) {
      return [];
    }

    return toolCalls
      .filter((toolCall): toolCall is OpenAI.ChatCompletionMessageToolCall & { type: "function" } => {
        return toolCall.type === "function";
      })
      .map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        input: parseToolArguments(toolCall.function.arguments),
      }));
  }

  private buildMessages(request: LLMRequest): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    for (const message of request.messages) {
      if (message.role === "user") {
        messages.push({ role: "user", content: message.content });
        continue;
      }

      if (message.role === "assistant") {
        if (message.toolCalls && message.toolCalls.length > 0) {
          messages.push({
            role: "assistant",
            content: message.content || null,
            tool_calls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: "function" as const,
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.input),
              },
            })),
          });
          continue;
        }

        messages.push({ role: "assistant", content: message.content });
        continue;
      }

      messages.push({
        role: "tool",
        tool_call_id: message.toolUseId,
        content: message.content,
      });
    }

    return messages;
  }

  private stripProviderPrefix(model: string): string {
    return model.includes("/") ? model.split("/").pop() ?? model : model;
  }

  private mapFinishReason(
    finishReason: string
  ): "end_turn" | "tool_use" | "max_tokens" {
    if (finishReason === "tool_calls") {
      return "tool_use";
    }
    if (finishReason === "length") {
      return "max_tokens";
    }
    return "end_turn";
  }

}
