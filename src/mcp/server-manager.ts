import type { MCPServerMap } from "./config.js";
import { MCPClient, type MCPToolInfo } from "./client.js";
import { logger } from "../utils/logger.js";

export interface MCPServerTool extends MCPToolInfo {
  serverName: string;
}

export class MCPServerManager {
  private readonly clients: Map<string, MCPClient> = new Map();

  constructor(private readonly servers: MCPServerMap) {}

  async startAll(): Promise<void> {
    const entries = Object.entries(this.servers);
    if (entries.length === 0) {
      return;
    }

    logger.info(`Starting ${entries.length} MCP server(s)`);

    const results = await Promise.allSettled(
      entries.map(async ([name, config]) => {
        const client = new MCPClient(name);
        try {
          await client.connect(config);
          this.clients.set(name, client);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`MCP server ${name} failed to start`, message);
          // Don't crash BombaCode — just skip this server
        }
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    logger.info(`MCP servers started: ${succeeded} succeeded, ${failed} failed`);
  }

  async stopAll(): Promise<void> {
    const disconnects = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        await client.disconnect();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error stopping MCP server ${name}`, message);
      }
    });

    await Promise.allSettled(disconnects);
    this.clients.clear();
    logger.info("All MCP servers stopped");
  }

  async getTools(): Promise<MCPServerTool[]> {
    const allTools: MCPServerTool[] = [];

    for (const [serverName, client] of this.clients) {
      if (!client.connected) {
        continue;
      }

      try {
        const tools = await client.listTools();
        for (const tool of tools) {
          allTools.push({ ...tool, serverName });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to get tools from MCP server ${serverName}`, message);
      }
    }

    return allTools;
  }

  getClient(serverName: string): MCPClient | undefined {
    return this.clients.get(serverName);
  }

  getActiveServerNames(): string[] {
    return Array.from(this.clients.keys()).filter((name) => {
      const client = this.clients.get(name);
      return client?.connected ?? false;
    });
  }

  list(): string[] {
    return Object.keys(this.servers);
  }
}
