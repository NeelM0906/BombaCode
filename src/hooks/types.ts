export type HookEvent =
  | "pre_tool_use" // Before tool execution (informational only)
  | "post_tool_use" // After successful tool execution
  | "post_tool_failure" // After failed tool execution
  | "pre_commit" // Before git commit
  | "session_start" // Session begins
  | "stop" // Agent finishes responding
  | "post_edit"; // After file edit (write/edit tool)

export interface HookContext {
  event: HookEvent;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  error?: Error;
  filePath?: string;
  payload?: Record<string, unknown>;
}

export interface HookResult {
  message?: string; // Optional message to log/display
}

export type HookHandler = (context: HookContext) => Promise<HookResult | void>;
