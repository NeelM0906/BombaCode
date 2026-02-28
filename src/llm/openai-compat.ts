import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent, TokenUsage } from "./types.js";

export class OpenAICompatProvider implements LLMProvider {
  name = "openai-compat";
  private readonly client: OpenAI;

  constructor(baseURL: string, apiKey?: string) {
    this.client = new OpenAI({
      baseURL,
      apiKey: apiKey || "not-required",
    });
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages
        .filter((message) => message.role !== "tool")
        .map((message) => ({ role: message.role, content: message.content })),
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0,
    });

    const usage: TokenUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };

    return {
      content: response.choices[0]?.message.content ?? "",
      toolCalls: [],
      stopReason: "end_turn",
      usage,
    };
  }

  async *streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent> {
    const response = await this.createMessage(request);
    yield { type: "text_delta", content: response.content };
    yield { type: "usage", usage: response.usage };
    yield { type: "done" };
  }

  getMaxContextTokens(): number {
    return 128_000;
  }
}
