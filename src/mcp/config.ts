export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export type MCPServerMap = Record<string, MCPServerConfig>;
