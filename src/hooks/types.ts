export type HookEvent = "pre_tool" | "post_tool" | "pre_commit";

export interface HookContext {
  event: HookEvent;
  payload?: Record<string, unknown>;
}

export type HookHandler = (context: HookContext) => Promise<void>;
