import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger.js";
import { isAbortError, withCancellation, withRetry } from "./streaming.js";
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

    // Anthropic requires temperature=1 when thinking is enabled
    const temperature = thinking ? 1 : (request.temperature ?? 0);

    const response = await withRetry(async () => {
      return this.client.messages.create(
        {
          model,
          system,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          thinking,
          max_tokens: request.maxTokens ?? 4096,
          temperature,
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

    // Anthropic requires temperature=1 when thinking is enabled
    const temperature = thinking ? 1 : (request.temperature ?? 0);

    const stream = this.client.messages.stream(
      {
        model,
        system,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        thinking,
        max_tokens: request.maxTokens ?? 4096,
        temperature,
      },
      { signal: request.abortSignal }
    );

    // Track current tool call being built
    let currentToolId = "";
    let currentToolName = "";
    let currentToolArgs = "";
    let stopReason: "end_turn" | "tool_use" | "max_tokens" = "end_turn";

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
      } else if (event.type === "message_delta") {
        const reason = (event.delta as { stop_reason?: string | null }).stop_reason;
        if (reason === "tool_use") {
          stopReason = "tool_use";
        } else if (reason === "max_tokens") {
          stopReason = "max_tokens";
        } else if (reason === "end_turn") {
          stopReason = "end_turn";
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

    if (finalMessage.stop_reason === "tool_use") {
      stopReason = "tool_use";
    } else if (finalMessage.stop_reason === "max_tokens") {
      stopReason = "max_tokens";
    } else if (finalMessage.stop_reason === "end_turn") {
      stopReason = "end_turn";
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

    yield { type: "done", stopReason };
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

}
