import type { LLMProvider, StreamEvent, TokenUsage } from "../llm/types.js";
import type { CostTracker } from "../llm/cost-tracker.js";
import type { MessageManager } from "./message-manager.js";
import { logger } from "../utils/logger.js";

export interface AgentLoopConfig {
  messageManager: MessageManager;
  provider: LLMProvider;
  costTracker: CostTracker;
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  onStreamDelta?: (text: string) => void;
  onStreamEnd?: (fullResponse: string) => void;
  onUsageUpdate?: (usage: TokenUsage) => void;
  onError?: (error: Error) => void;
}

export class AgentLoop {
  private messageManager: MessageManager;
  private provider: LLMProvider;
  private costTracker: CostTracker;
  private model: string;
  private systemPrompt: string;
  private maxTokens: number;
  private _isProcessing = false;
  private _aborted = false;

  // Callbacks
  private onStreamDelta?: (text: string) => void;
  private onStreamEnd?: (fullResponse: string) => void;
  private onUsageUpdate?: (usage: TokenUsage) => void;
  private onError?: (error: Error) => void;

  constructor(config: AgentLoopConfig) {
    this.messageManager = config.messageManager;
    this.provider = config.provider;
    this.costTracker = config.costTracker;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt ?? "";
    this.maxTokens = config.maxTokens ?? 4096;
    this.onStreamDelta = config.onStreamDelta;
    this.onStreamEnd = config.onStreamEnd;
    this.onUsageUpdate = config.onUsageUpdate;
    this.onError = config.onError;
  }

  /**
   * Process user input and get a streaming response
   * Phase 1: conversation only (no tool use loop)
   */
  async processUserInput(input: string): Promise<string> {
    if (this._isProcessing) {
      throw new Error("Agent is already processing a request");
    }

    this._isProcessing = true;
    this._aborted = false;

    try {
      this.messageManager.addUserMessage(input);

      let fullResponse = "";

      logger.debug("Sending request to LLM", {
        model: this.model,
        messageCount: this.messageManager.getMessageCount(),
      });

      const stream = this.provider.streamMessage({
        model: this.model,
        systemPrompt: this.systemPrompt,
        messages: this.messageManager.getMessages(),
        maxTokens: this.maxTokens,
      });

      for await (const event of stream) {
        // Check for abort
        if (this._aborted) {
          logger.info("Stream aborted by user");
          break;
        }

        switch (event.type) {
          case "text_delta":
            fullResponse += event.content;
            this.onStreamDelta?.(event.content);
            break;

          case "usage":
            this.costTracker.recordUsage(this.model, event.usage);
            this.onUsageUpdate?.(event.usage);
            break;

          case "error":
            throw new Error(event.error);

          case "done":
            break;

          // Phase 2+ will handle tool_call_start, tool_call_delta, tool_call_end
          default:
            break;
        }
      }

      // Add the response to message history
      if (fullResponse) {
        this.messageManager.addAssistantMessage(fullResponse);
      }

      this.onStreamEnd?.(fullResponse);

      logger.debug("LLM response complete", {
        responseLength: fullResponse.length,
        totalTokens: this.costTracker.getTotalTokens(),
        cost: this.costTracker.getSessionCost(),
      });

      return fullResponse;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Agent loop error", error.message);
      this.onError?.(error);
      throw error;
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Abort the current processing
   */
  abort(): void {
    this._aborted = true;
  }

  /**
   * Check if the agent is currently processing
   */
  isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Update the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Update the model
   */
  setModel(model: string): void {
    this.model = model;
  }
}
