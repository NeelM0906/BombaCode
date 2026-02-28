import OpenAI from "openai";
import { withCancellation, withRetry, parseToolArguments } from "./streaming.js";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamEvent,
  ToolCall,
  TokenUsage,
} from "./types.js";

// Max context tokens per model (conservative estimates)
const MODEL_CONTEXT: Record<string, number> = {
  "anthropic/claude-opus-4-6": 200_000,
  "anthropic/claude-sonnet-4-6": 200_000,
  "anthropic/claude-haiku-4-5": 200_000,
  "anthropic/claude-opus-4-5-20251101": 200_000,
  "anthropic/claude-sonnet-4-5-20250929": 200_000,
  "anthropic/claude-haiku-4-5-20251001": 200_000,
  "openai/gpt-5": 400_000,
  "google/gemini-2.5-pro-preview": 1_000_000,
  "google/gemini-2.0-flash": 1_000_000,
  "openai/gpt-4o": 128_000,
  "openai/o3-mini": 128_000,
  "meta-llama/llama-4-maverick": 1_000_000,
  "deepseek/deepseek-r1": 64_000,
};

export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "X-Title": "BombaCode",
        "HTTP-Referer": "https://github.com/bombacode",
      },
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
    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
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

    // Parse response
    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? [])
      .filter(
        (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } =>
          tc.type === "function"
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: parseToolArguments(tc.function.arguments),
      }));

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

    return { content, toolCalls, stopReason, usage };
  }

  async *streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent> {
    const messages = this.buildMessages(request);
    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
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

    // Track tool calls being assembled across chunks
    const pendingToolCalls: Map<number, { id: string; name: string; args: string; started: boolean }> = new Map();

    for await (const chunk of withCancellation(stream, request.abortSignal)) {
      const delta = chunk.choices[0]?.delta;

      // Text content
      if (delta?.content) {
        yield { type: "text_delta", content: delta.content };
      }

      // Tool call chunks
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!pendingToolCalls.has(idx)) {
            pendingToolCalls.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              args: "",
              started: false,
            });
          }
          const pending = pendingToolCalls.get(idx)!;
          if (tc.id) pending.id = tc.id;
          if (tc.function?.name) pending.name = tc.function.name;
          if (!pending.started && pending.id && pending.name) {
            pending.started = true;
            yield { type: "tool_call_start", toolCall: { id: pending.id, name: pending.name } };
          }
          if (tc.function?.arguments) {
            pending.args += tc.function.arguments;
            yield { type: "tool_call_delta", content: tc.function.arguments };
          }
        }
      }

      // Usage info (comes with the final chunk when stream_options.include_usage is true)
      if (chunk.usage) {
        yield {
          type: "usage",
          usage: {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          },
        };
      }
    }

    // Emit completed tool calls
    for (const pending of pendingToolCalls.values()) {
      if (!pending.started && pending.id && pending.name) {
        yield { type: "tool_call_start", toolCall: { id: pending.id, name: pending.name } };
      }
      yield {
        type: "tool_call_end",
        toolCall: {
          id: pending.id,
          name: pending.name,
          input: parseToolArguments(pending.args),
        },
      };
    }

    yield { type: "done" };
  }

  getMaxContextTokens(model: string): number {
    return MODEL_CONTEXT[model] ?? 128_000;
  }

  // --- Private helpers ---

  private buildMessages(
    request: LLMRequest
  ): OpenAI.ChatCompletionMessageParam[] {
    const msgs: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      msgs.push({ role: "system", content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      if (msg.role === "user") {
        msgs.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msgs.push({
            role: "assistant",
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          });
        } else {
          msgs.push({ role: "assistant", content: msg.content });
        }
      } else if (msg.role === "tool") {
        msgs.push({
          role: "tool",
          tool_call_id: msg.toolUseId,
          content: msg.content,
        });
      }
    }

    return msgs;
  }

}
