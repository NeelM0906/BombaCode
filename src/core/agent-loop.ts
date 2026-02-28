import type { LLMProvider, ToolCall, ToolResult, TokenUsage } from "../llm/types.js";
import type { CostTracker } from "../llm/cost-tracker.js";
import type { MessageManager } from "./message-manager.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { ToolRouter } from "./tool-router.js";
import { logger } from "../utils/logger.js";

export interface AgentLoopConfig {
  messageManager: MessageManager;
  provider: LLMProvider;
  costTracker: CostTracker;
  model: string;
  systemPrompt?: string;
  maxTokens?: number;
  maxTurns?: number;
  toolRegistry?: ToolRegistry;
  toolRouter?: ToolRouter;
  onStreamDelta?: (text: string) => void;
  onStreamEnd?: (fullResponse: string) => void;
  onUsageUpdate?: (usage: TokenUsage) => void;
  onToolCallStart?: (toolCall: ToolCall) => void;
  onToolCallEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  onError?: (error: Error) => void;
}

export class AgentLoop {
  private readonly messageManager: MessageManager;
  private readonly provider: LLMProvider;
  private readonly costTracker: CostTracker;
  private readonly toolRegistry?: ToolRegistry;
  private readonly toolRouter?: ToolRouter;
  private model: string;
  private systemPrompt: string;
  private maxTokens: number;
  private maxTurns: number;
  private _isProcessing = false;
  private _aborted = false;

  private readonly onStreamDelta?: (text: string) => void;
  private readonly onStreamEnd?: (fullResponse: string) => void;
  private readonly onUsageUpdate?: (usage: TokenUsage) => void;
  private readonly onToolCallStart?: (toolCall: ToolCall) => void;
  private readonly onToolCallEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  private readonly onError?: (error: Error) => void;

  constructor(config: AgentLoopConfig) {
    this.messageManager = config.messageManager;
    this.provider = config.provider;
    this.costTracker = config.costTracker;
    this.toolRegistry = config.toolRegistry;
    this.toolRouter = config.toolRouter;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt ?? "";
    this.maxTokens = config.maxTokens ?? 4096;
    this.maxTurns = config.maxTurns ?? 25;
    this.onStreamDelta = config.onStreamDelta;
    this.onStreamEnd = config.onStreamEnd;
    this.onUsageUpdate = config.onUsageUpdate;
    this.onToolCallStart = config.onToolCallStart;
    this.onToolCallEnd = config.onToolCallEnd;
    this.onError = config.onError;
  }

  async processUserInput(input: string): Promise<string> {
    if (this._isProcessing) {
      throw new Error("Agent is already processing a request");
    }

    this._isProcessing = true;
    this._aborted = false;

    try {
      this.messageManager.addUserMessage(input);
      let fullTextResponse = "";
      let turnCount = 0;

      while (true) {
        if (this._aborted) {
          logger.info("Agent loop aborted before turn completion");
          break;
        }

        if (turnCount >= this.maxTurns) {
          logger.warn(`Agent loop reached max turns (${this.maxTurns})`);
          const maxTurnNote = `\n\n[Reached maximum turns limit (${this.maxTurns}). Use /continue to resume.]`;
          fullTextResponse += maxTurnNote;
          break;
        }

        turnCount += 1;

        const requestTools = this.toolRegistry?.getToolDefinitions() ?? [];

        const stream = this.provider.streamMessage({
          model: this.model,
          systemPrompt: this.systemPrompt,
          messages: this.messageManager.getMessages(),
          tools: requestTools.length > 0 ? requestTools : undefined,
          maxTokens: this.maxTokens,
        });

        let turnText = "";
        const toolCalls: ToolCall[] = [];

        for await (const event of stream) {
          if (this._aborted) {
            logger.info("Agent loop aborted during stream processing");
            break;
          }

          switch (event.type) {
            case "text_delta":
              turnText += event.content;
              this.onStreamDelta?.(event.content);
              break;
            case "tool_call_start":
              this.onToolCallStart?.({
                id: event.toolCall.id,
                name: event.toolCall.name,
                input: {},
              });
              break;
            case "tool_call_end":
              toolCalls.push(event.toolCall);
              break;
            case "usage":
              this.costTracker.recordUsage(this.model, event.usage);
              this.onUsageUpdate?.(event.usage);
              break;
            case "error":
              throw new Error(event.error);
            case "done":
              break;
          }
        }

        this.messageManager.addAssistantMessage(turnText, toolCalls.length > 0 ? toolCalls : undefined);
        fullTextResponse += turnText;

        if (toolCalls.length === 0) {
          this.onStreamEnd?.(fullTextResponse);
          break;
        }

        if (!this.toolRouter) {
          const fallbackResults = toolCalls.map<ToolResult>((call) => ({
            toolUseId: call.id,
            content: `Error: Tool router is not configured for tool '${call.name}'.`,
            isError: true,
          }));

          for (const result of fallbackResults) {
            this.messageManager.addToolExecutionResult(result);
            const sourceCall = toolCalls.find((call) => call.id === result.toolUseId);
            if (sourceCall) {
              this.onToolCallEnd?.(sourceCall, result);
            }
          }

          fullTextResponse += "\n";
          this.onStreamEnd?.(turnText);
          continue;
        }

        const results = await this.toolRouter.executeToolCalls(toolCalls);

        for (const result of results) {
          this.messageManager.addToolExecutionResult(result);
          const sourceCall = toolCalls.find((call) => call.id === result.toolUseId);
          if (sourceCall) {
            this.onToolCallEnd?.(sourceCall, result);
          }
        }

        this.onStreamEnd?.(turnText);
        fullTextResponse += "\n";
      }

      return fullTextResponse;
    } catch (error: unknown) {
      const wrappedError = error instanceof Error ? error : new Error(String(error));
      logger.error("Agent loop error", wrappedError.message);
      this.onError?.(wrappedError);
      throw wrappedError;
    } finally {
      this._isProcessing = false;
    }
  }

  abort(): void {
    this._aborted = true;
  }

  isProcessing(): boolean {
    return this._isProcessing;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  setModel(model: string): void {
    this.model = model;
  }
}
