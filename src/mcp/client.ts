import type { MCPServerConfig } from "./config.js";

export class MCPClient {
  constructor(private readonly config: MCPServerConfig) {}

  getCommand(): string {
    return this.config.command;
  }
}
