import type { ToolCall, ToolResult } from "../llm/types.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { PermissionManager, PermissionDecision } from "./permission-manager.js";
import type { CheckpointManager } from "./checkpoint-manager.js";
import { TokenCounter } from "../llm/token-counter.js";
import type { Tool } from "../tools/base-tool.js";
import { logger } from "../utils/logger.js";

export interface ToolRouterConfig {
  registry: ToolRegistry;
  permissionManager: PermissionManager;
  checkpointManager: CheckpointManager;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  onPermissionRequest?: (toolCall: ToolCall) => Promise<PermissionDecision>;
}

interface PreparedToolCall {
  call: ToolCall;
  tool?: Tool;
  precomputedResult?: ToolResult;
}

export class ToolRouter {
  private readonly config: ToolRouterConfig;
  private readonly tokenCounter: TokenCounter;

  constructor(config: ToolRouterConfig) {
    this.config = config;
    this.tokenCounter = new TokenCounter();
  }

  async executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
    const prepared = await this.checkPermissions(calls);
    const resultsByCallId = new Map<string, ToolResult>();

    const readonlyCalls = prepared.filter(
      (entry) => !entry.precomputedResult && entry.tool?.category === "readonly"
    ) as Array<PreparedToolCall & { tool: Tool }>;

    const mutatingCalls = prepared.filter(
      (entry) => !entry.precomputedResult && entry.tool?.category !== "readonly"
    ) as Array<PreparedToolCall & { tool: Tool }>;

    for (const entry of prepared) {
      if (entry.precomputedResult) {
        resultsByCallId.set(entry.call.id, entry.precomputedResult);
      }
    }

    const readonlySettled = await Promise.allSettled(
      readonlyCalls.map((entry) => this.executePreparedTool(entry.call, entry.tool))
    );

    readonlySettled.forEach((settled, index) => {
      const callId = readonlyCalls[index]?.call.id;
      if (!callId) {
        return;
      }

      if (settled.status === "fulfilled") {
        resultsByCallId.set(callId, settled.value);
      } else {
        resultsByCallId.set(callId, {
          toolUseId: callId,
          content: `Error executing tool call: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
          isError: true,
        });
      }
    });

    for (const entry of mutatingCalls) {
      const result = await this.executePreparedTool(entry.call, entry.tool);
      resultsByCallId.set(entry.call.id, result);
    }

    return calls.map((call) => {
      const result = resultsByCallId.get(call.id);
      if (result) {
        return result;
      }

      return {
        toolUseId: call.id,
        content: `Error: Missing tool result for "${call.name}"`,
        isError: true,
      };
    });
  }

  private async checkPermissions(calls: ToolCall[]): Promise<PreparedToolCall[]> {
    const prepared: PreparedToolCall[] = [];

    for (const call of calls) {
      const tool = this.config.registry.getTool(call.name);

      if (!tool) {
        prepared.push({
          call,
          precomputedResult: {
            toolUseId: call.id,
            content: `Error: Unknown tool "${call.name}". Available tools: ${this.config.registry.getToolNames().join(", ")}`,
            isError: true,
          },
        });
        continue;
      }

      const permission = await this.config.permissionManager.check(call, tool);
      if (permission === "denied") {
        prepared.push({
          call,
          tool,
          precomputedResult: {
            toolUseId: call.id,
            content: `Permission denied for tool "${call.name}". The user blocked this action.`,
            isError: true,
          },
        });
        continue;
      }

      if (permission === "ask") {
        if (!this.config.onPermissionRequest) {
          prepared.push({
            call,
            tool,
            precomputedResult: {
              toolUseId: call.id,
              content: `Permission denied for tool "${call.name}" because interactive approval is unavailable.`,
              isError: true,
            },
          });
          continue;
        }

        const decision = await this.config.onPermissionRequest(call);
        if (decision === "denied") {
          prepared.push({
            call,
            tool,
            precomputedResult: {
              toolUseId: call.id,
              content: `Permission denied by user for tool "${call.name}".`,
              isError: true,
            },
          });
          continue;
        }
      }

      prepared.push({ call, tool });
    }

    return prepared;
  }

  private async executePreparedTool(call: ToolCall, tool: Tool): Promise<ToolResult> {
    this.config.onToolStart?.(call);

    try {
      if (tool.category === "write" || tool.category === "execute") {
        const filePath = call.input.file_path;
        if (typeof filePath === "string" && filePath.trim().length > 0) {
          await this.config.checkpointManager.snapshot(filePath);
        }
      }

      const executionResult = await tool.execute(call.input);
      const formattedContent = this.formatToolResult(executionResult.content);

      const toolResult: ToolResult = {
        toolUseId: call.id,
        content: formattedContent,
        isError: executionResult.isError,
      };

      this.config.onToolEnd?.(call, toolResult);
      logger.debug("Tool executed", {
        tool: call.name,
        isError: executionResult.isError,
        contentLength: formattedContent.length,
      });

      return toolResult;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const toolResult: ToolResult = {
        toolUseId: call.id,
        content: `Error executing tool "${call.name}": ${message}`,
        isError: true,
      };

      this.config.onToolEnd?.(call, toolResult);
      logger.error("Tool execution failed", {
        tool: call.name,
        error: message,
      });

      return toolResult;
    }
  }

  private formatToolResult(content: string): string {
    const estimatedTokens = this.tokenCounter.estimateTokens(content);

    if (estimatedTokens <= 500) {
      return content;
    }

    if (estimatedTokens <= 2000) {
      return this.truncateWithMarker(content, 2000);
    }

    return this.headTail(content, 500, 500);
  }

  private truncateWithMarker(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) {
      return content;
    }

    const truncated = content.slice(0, maxChars);
    const remaining = content.length - maxChars;

    return `${truncated}\n\n... [truncated ${remaining} characters] ...`;
  }

  private headTail(content: string, headTokens: number, tailTokens: number): string {
    const headChars = headTokens * 4;
    const tailChars = tailTokens * 4;

    if (content.length <= headChars + tailChars) {
      return content;
    }

    const head = content.slice(0, headChars);
    const tail = content.slice(-tailChars);
    const skipped = content.length - headChars - tailChars;

    return `${head}\n\n... [truncated ${skipped} characters] ...\n\n${tail}`;
  }
}
