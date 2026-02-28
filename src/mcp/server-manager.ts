import type { MCPServerMap } from "./config.js";

export class MCPServerManager {
  constructor(private readonly servers: MCPServerMap) {}

  list(): string[] {
    return Object.keys(this.servers);
  }
}
