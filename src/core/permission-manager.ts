import type { ToolCall } from "../llm/types.js";
import type { Tool } from "../tools/base-tool.js";

export type PermissionDecision = "allowed" | "denied" | "ask";

export interface PermissionState {
  allowFileWrite: "allow" | "deny" | "ask";
  allowBash: "allow" | "deny" | "ask";
  allowNetwork: "allow" | "deny" | "ask";
}

export class PermissionManager {
  constructor(private readonly state: PermissionState) {}

  async check(toolCall: ToolCall, tool: Tool): Promise<PermissionDecision> {
    if (tool.category === "readonly" || tool.category === "interactive") {
      return "allowed";
    }

    if (toolCall.name === "bash") {
      const mode = this.state.allowBash;
      if (mode === "allow") {
        return "allowed";
      }
      if (mode === "deny") {
        return "denied";
      }
      return "ask";
    }

    if (tool.category === "write") {
      const mode = this.state.allowFileWrite;
      if (mode === "allow") {
        return "allowed";
      }
      if (mode === "deny") {
        return "denied";
      }
      return "ask";
    }

    return "ask";
  }
}
