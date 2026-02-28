import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger.js";
import { isAbortError, withCancellation } from "./streaming.js";
import type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  StreamEvent,
  ToolCall,
  TokenUsage,
} from "./types.js";

const MODEL_CONTEXT: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-opus-4-5-20251101": 200_000,
  "claude-sonnet-4-5-20250929": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
};

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  supportsTools(): boolean {
    return true;
  }

  supportsThinking(): boolean {
    return true;
  }

  supportsCaching(): boolean {
    return true;
  }

  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const messages = this.buildMessages(request);
    const system = this.buildSystemPrompt(request.systemPrompt);
    const thinking = this.buildThinking(request);
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    // Strip the provider prefix for direct Anthropic calls
    const model = this.stripProviderPrefix(request.model);

    const response = await this.withRetry(async () => {
      return this.client.messages.create(
        {
          model,
          system,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          thinking,
          max_tokens: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0,
        },
        { signal: request.abortSignal }
      );
    }, request.abortSignal);

    // Parse content blocks
    let content = "";
    let thinkingContent = "";
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "thinking") {
        thinkingContent += block.thinking;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens,
      cacheWriteTokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens,
    };

    const stopReason =
      response.stop_reason === "tool_use"
        ? "tool_use"
        : response.stop_reason === "max_tokens"
          ? "max_tokens"
          : "end_turn";

    return {
      content,
      thinkingContent: thinkingContent || undefined,
      toolCalls,
      stopReason,
      usage,
    };
  }

  async *streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent> {
    const messages = this.buildMessages(request);
    const system = this.buildSystemPrompt(request.systemPrompt);
    const thinking = this.buildThinking(request);
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));

    const model = this.stripProviderPrefix(request.model);

    const stream = this.client.messages.stream(
      {
        model,
        system,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        thinking,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0,
      },
      { signal: request.abortSignal }
    );

    // Track current tool call being built
    let currentToolId = "";
    let currentToolName = "";
    let currentToolArgs = "";

    for await (const event of withCancellation(stream, request.abortSignal)) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "tool_use") {
          currentToolId = block.id;
          currentToolName = block.name;
          currentToolArgs = "";
          yield { type: "tool_call_start", toolCall: { id: block.id, name: block.name } };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text_delta", content: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          currentToolArgs += event.delta.partial_json;
          yield { type: "tool_call_delta", content: event.delta.partial_json };
        }
      } else if (event.type === "content_block_stop") {
        // If we were building a tool call, emit it
        if (currentToolId) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(currentToolArgs || "{}");
          } catch {
            logger.warn("Failed to parse tool call arguments", currentToolArgs);
          }
          yield {
            type: "tool_call_end",
            toolCall: { id: currentToolId, name: currentToolName, input },
          };
          currentToolId = "";
          currentToolName = "";
          currentToolArgs = "";
        }
      }
    }

    if (request.abortSignal?.aborted) {
      return;
    }

    // Get final message for usage
    const finalMessage = await stream.finalMessage().catch((error: unknown) => {
      if (request.abortSignal?.aborted || isAbortError(error)) {
        return null;
      }
      throw error;
    });
    if (!finalMessage) {
      return;
    }

    yield {
      type: "usage",
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        cacheReadTokens: (finalMessage.usage as unknown as Record<string, number>).cache_read_input_tokens,
        cacheWriteTokens: (finalMessage.usage as unknown as Record<string, number>).cache_creation_input_tokens,
      },
    };

    yield { type: "done" };
  }

  getMaxContextTokens(model: string): number {
    const stripped = this.stripProviderPrefix(model);
    return MODEL_CONTEXT[stripped] ?? 200_000;
  }

  // --- Private helpers ---

  private stripProviderPrefix(model: string): string {
    // "anthropic/claude-sonnet-4-5-20250929" → "claude-sonnet-4-5-20250929"
    return model.includes("/") ? model.split("/").pop()! : model;
  }

  private buildMessages(request: LLMRequest): Anthropic.MessageParam[] {
    const msgs: Anthropic.MessageParam[] = [];

    for (const msg of request.messages) {
      if (msg.role === "user") {
        msgs.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        msgs.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        msgs.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolUseId,
              content: msg.content,
            },
          ],
        });
      }
    }

    return msgs;
  }

  private buildSystemPrompt(systemPrompt?: string): Anthropic.MessageCreateParams["system"] {
    if (!systemPrompt) {
      return undefined;
    }

    return [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  private buildThinking(request: LLMRequest): Anthropic.ThinkingConfigParam | undefined {
    if (!request.thinking?.enabled) {
      return undefined;
    }

    const maxTokens = request.maxTokens ?? 4096;
    const requestedBudget = request.thinking.budgetTokens ?? Math.min(2048, Math.max(1024, maxTokens - 1));
    const safeBudget = Math.max(1024, Math.min(requestedBudget, Math.max(1024, maxTokens - 1)));

    return {
      type: "enabled",
      budget_tokens: safeBudget,
    };
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    signal?: AbortSignal,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err)) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));
        const status = (err as { status?: number }).status;

        if (status === 401) {
          throw new Error("Invalid API key. Run `bomba init` to reconfigure.");
        }

        if (status === 429 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Rate limited. Retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (status && status >= 500 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`Server error (${status}). Retrying in ${delay / 1000}s...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw lastError;
      }
    }
    throw lastError ?? new Error("Max retries exceeded");
  }
}
