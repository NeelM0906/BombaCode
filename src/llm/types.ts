// ─── Message Types ───

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolUseId: string; content: string };

// ─── Tool Types ───

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens?: number;
}

// ─── LLM Request / Response ───

export interface LLMRequest {
  model: string;
  systemPrompt?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  thinking?: ThinkingConfig;
  maxTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface LLMResponse {
  content: string;
  thinkingContent?: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: TokenUsage;
}

// ─── Streaming ───

export type StreamEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; toolCall: { id: string; name: string } }
  | { type: "tool_call_delta"; content: string }
  | { type: "tool_call_end"; toolCall: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; stopReason: "end_turn" | "tool_use" | "max_tokens" }
  | { type: "error"; error: string };

// ─── Token Usage ───

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ─── Provider Interface ───

export interface LLMProvider {
  name: string;
  createMessage(request: LLMRequest): Promise<LLMResponse>;
  streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent>;
  getMaxContextTokens(model: string): number;
  supportsTools(): boolean;
  supportsThinking(): boolean;
  supportsCaching(): boolean;
  estimateTokens(text: string): number;
}
