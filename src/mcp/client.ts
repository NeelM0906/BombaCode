import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "./config.js";
import { logger } from "../utils/logger.js";

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private _connected = false;

  constructor(private readonly serverName: string) {}

  async connect(config: MCPServerConfig): Promise<void> {
    try {
      this.transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        stderr: "pipe",
      });

      this.client = new Client({
        name: "bombacode",
        version: "1.0.0",
      });

      await this.client.connect(this.transport);
      this._connected = true;
      logger.info(`MCP server connected: ${this.serverName}`);
    } catch (error: unknown) {
      this._connected = false;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to connect MCP server ${this.serverName}`, message);
      throw new Error(`MCP connection failed for ${this.serverName}: ${message}`);
    }
  }

  async listTools(): Promise<MCPToolInfo[]> {
    if (!this.client || !this._connected) {
      return [];
    }

    try {
      const result = await this.client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list tools from ${this.serverName}`, message);
      return [];
    }
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<string> {
    if (!this.client || !this._connected) {
      throw new Error(`MCP server ${this.serverName} is not connected`);
    }

    const result = await this.client.callTool({ name, arguments: input });

    // Handle the union type — extract text content from the result
    if ("content" in result && Array.isArray(result.content)) {
      return result.content
        .map((c) => {
          if ("text" in c && typeof c.text === "string") {
            return c.text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    // Fallback for compatibility result format
    if ("toolResult" in result) {
      return String(result.toolResult);
    }

    return "";
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    try {
      if (this.transport) {
        await this.transport.close();
      }
      logger.info(`MCP server disconnected: ${this.serverName}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Error disconnecting MCP server ${this.serverName}`, message);
    } finally {
      this.client = null;
      this.transport = null;
    }
  }

  get connected(): boolean {
    return this._connected;
  }
}
