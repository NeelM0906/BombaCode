import type { ToolCall, ToolResult } from "../llm/types.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { PermissionManager, PermissionDecision } from "./permission-manager.js";
import type { CheckpointManager } from "./checkpoint-manager.js";
import { truncateLines, truncateResult } from "../tools/base-tool.js";
import { logger } from "../utils/logger.js";

export interface ToolRouterConfig {
  registry: ToolRegistry;
  permissionManager: PermissionManager;
  checkpointManager: CheckpointManager;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  onPermissionRequest?: (toolCall: ToolCall) => Promise<PermissionDecision>;
}

export class ToolRouter {
  private readonly config: ToolRouterConfig;

  constructor(config: ToolRouterConfig) {
    this.config = config;
  }

  async executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of calls) {
      const result = await this.executeSingleTool(call);
      results.push(result);
    }

    return results;
  }

  private async executeSingleTool(call: ToolCall): Promise<ToolResult> {
    const tool = this.config.registry.getTool(call.name);

    if (!tool) {
      return {
        toolUseId: call.id,
        content: `Error: Unknown tool "${call.name}". Available tools: ${this.config.registry.getToolNames().join(", ")}`,
        isError: true,
      };
    }

    const permission = await this.config.permissionManager.check(call, tool);

    if (permission === "denied") {
      return {
        toolUseId: call.id,
        content: `Permission denied for tool "${call.name}". The user blocked this action.`,
        isError: true,
      };
    }

    if (permission === "ask" && this.config.onPermissionRequest) {
      const decision = await this.config.onPermissionRequest(call);
      if (decision === "denied") {
        return {
          toolUseId: call.id,
          content: `Permission denied by user for tool "${call.name}".`,
          isError: true,
        };
      }
    }

    this.config.onToolStart?.(call);

    try {
      if (tool.category === "write" || tool.category === "execute") {
        const filePath = call.input.file_path;
        if (typeof filePath === "string" && filePath.trim().length > 0) {
          await this.config.checkpointManager.snapshot(filePath);
        }
      }

      const executionResult = await tool.execute(call.input);
      let content = truncateLines(executionResult.content);
      content = truncateResult(content);

      const toolResult: ToolResult = {
        toolUseId: call.id,
        content,
        isError: executionResult.isError,
      };

      this.config.onToolEnd?.(call, toolResult);
      logger.debug("Tool executed", {
        tool: call.name,
        isError: executionResult.isError,
        contentLength: content.length,
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
}
