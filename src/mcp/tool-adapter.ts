import type { Tool, ToolInput, ToolExecuteResult } from "../tools/base-tool.js";
import type { MCPClient } from "./client.js";
import type { MCPServerTool } from "./server-manager.js";
import { logger } from "../utils/logger.js";

/**
 * Converts an MCP tool into BombaCode's internal Tool interface.
 * Tool names are prefixed with `mcp_` to avoid collisions with built-in tools.
 */
export function adaptMCPTool(mcpTool: MCPServerTool, client: MCPClient): Tool {
  const prefixedName = `mcp_${mcpTool.name}`;

  return {
    name: prefixedName,
    description: mcpTool.description,
    inputSchema: mcpTool.inputSchema,
    category: "execute" as const,

    async execute(input: ToolInput): Promise<ToolExecuteResult> {
      try {
        const result = await client.callTool(mcpTool.name, input as Record<string, unknown>);
        return {
          content: result,
          isError: false,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`MCP tool ${prefixedName} failed`, message);
        return {
          content: `MCP tool error: ${message}`,
          isError: true,
        };
      }
    },
  };
}

/**
 * Adapts all tools from an MCP server manager into BombaCode tools.
 */
export async function adaptAllMCPTools(
  tools: MCPServerTool[],
  getClient: (serverName: string) => MCPClient | undefined
): Promise<Tool[]> {
  const adapted: Tool[] = [];

  for (const tool of tools) {
    const client = getClient(tool.serverName);
    if (!client) {
      continue;
    }

    adapted.push(adaptMCPTool(tool, client));
  }

  return adapted;
}
