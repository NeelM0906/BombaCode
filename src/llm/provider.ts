import type { LLMRequest, LLMResponse, StreamEvent } from "./types.js";

export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsPromptCaching: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface Provider {
  name: string;
  capabilities: ProviderCapabilities;
  createMessage(request: LLMRequest): Promise<LLMResponse>;
  streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent>;
  getMaxContextTokens(model: string): number;
}
