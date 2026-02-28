import type { ToolCall } from "../llm/types.js";
import type { Tool } from "../tools/base-tool.js";

export type PermissionDecision = "allowed" | "denied" | "ask";
export type PermissionMode = "normal" | "auto-edit" | "yolo" | "plan";

export interface PermissionRule {
  type: "allow" | "deny" | "ask";
  tool?: string;
  pathPattern?: string;
  commandPattern?: string;
}

const DEFAULT_DENY_RULES: PermissionRule[] = [
  { type: "deny", tool: "bash", commandPattern: "*rm -rf /*" },
  { type: "deny", tool: "bash", commandPattern: "*sudo rm*" },
  { type: "deny", tool: "bash", commandPattern: "*> /dev/sda*" },
  { type: "deny", tool: "bash", commandPattern: "*:(){ :|:& };:*" },
  { type: "deny", tool: "bash", commandPattern: "*mkfs*" },
  { type: "deny", tool: "bash", commandPattern: "*dd if=/dev/zero*" },
  { type: "deny", tool: "bash", commandPattern: "*chmod 777 /*" },
];

const DEFAULT_RULES: PermissionRule[] = [
  { type: "allow", tool: "read" },
  { type: "allow", tool: "glob" },
  { type: "allow", tool: "grep" },
  { type: "allow", tool: "todo" },
  { type: "allow", tool: "ask_user" },
  { type: "ask", tool: "write" },
  { type: "ask", tool: "edit" },
  { type: "ask", tool: "bash" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globMatch(pattern: string, value: string): boolean {
  const regexPattern = `^${pattern.split("*").map(escapeRegExp).join(".*")}$`;
  return new RegExp(regexPattern).test(value);
}

export class PermissionManager {
  private readonly rules: PermissionRule[];
  private readonly sessionAllowList = new Set<string>();
  private mode: PermissionMode;

  constructor(mode: PermissionMode, customRules: PermissionRule[] = []) {
    this.mode = mode;
    this.rules = [...DEFAULT_DENY_RULES, ...customRules, ...DEFAULT_RULES];
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  addSessionAllow(toolName: string): void {
    this.sessionAllowList.add(toolName);
  }

  async check(toolCall: ToolCall, tool: Tool): Promise<PermissionDecision> {
    if (this.mode === "yolo") {
      return "allowed";
    }

    if (this.mode === "plan") {
      return tool.category === "readonly" ? "allowed" : "denied";
    }

    if (this.sessionAllowList.has(toolCall.name)) {
      return "allowed";
    }

    for (const rule of this.rules) {
      if (!this.ruleMatches(rule, toolCall)) {
        continue;
      }

      if (rule.type === "deny") {
        return "denied";
      }
      if (rule.type === "allow") {
        return "allowed";
      }
      return "ask";
    }

    switch (tool.category) {
      case "readonly":
      case "interactive":
        return "allowed";
      case "write":
        return this.mode === "auto-edit" ? "allowed" : "ask";
      case "execute":
      default:
        return "ask";
    }
  }

  private ruleMatches(rule: PermissionRule, call: ToolCall): boolean {
    if (rule.tool && !globMatch(rule.tool, call.name)) {
      return false;
    }

    if (rule.pathPattern) {
      const filePath = call.input.file_path;
      if (typeof filePath !== "string" || !globMatch(rule.pathPattern, filePath)) {
        return false;
      }
    }

    if (rule.commandPattern) {
      const command = call.input.command;
      if (typeof command !== "string" || !globMatch(rule.commandPattern, command)) {
        return false;
      }
    }

    return true;
  }
}

export { DEFAULT_DENY_RULES, DEFAULT_RULES };
