import { execFile } from "node:child_process";
import type { HookEvent, HookHandler, HookContext, HookResult } from "./types.js";
import type { Settings } from "../memory/settings.js";
import { logger } from "../utils/logger.js";

/** Timeout for shell command hooks (10 seconds). */
const SHELL_HOOK_TIMEOUT_MS = 10_000;

export class HookManager {
  private readonly hooks = new Map<HookEvent, HookHandler[]>();

  /**
   * Register a programmatic hook handler for a specific event.
   */
  register(event: HookEvent, handler: HookHandler): void {
    const handlers = this.hooks.get(event) ?? [];
    handlers.push(handler);
    this.hooks.set(event, handlers);
  }

  /**
   * Load hook definitions from the settings file.
   * Each entry specifies a shell command and an optional tool-name matcher regex.
   */
  loadFromSettings(settings: Settings): void {
    const hookConfig = settings.hooks ?? {};

    for (const [event, entries] of Object.entries(hookConfig)) {
      const hookEvent = event as HookEvent;

      for (const entry of entries) {
        const matcher = entry.matcher ? new RegExp(entry.matcher) : undefined;

        const handler: HookHandler = async (context: HookContext): Promise<HookResult | void> => {
          // If a matcher is specified, only run when the tool name (or file path for post_edit) matches
          if (matcher) {
            const target = context.toolName ?? context.filePath ?? "";
            if (!matcher.test(target)) {
              return;
            }
          }

          return this.executeShellHook(entry.command, context);
        };

        this.register(hookEvent, handler);
      }
    }
  }

  /**
   * Run all handlers registered for a given event.
   * Hook errors are caught and logged — they never crash the system.
   * Returns an array of messages from hooks that returned them.
   */
  async run(event: HookEvent, context?: Omit<HookContext, "event">): Promise<string[]> {
    const handlers = this.hooks.get(event) ?? [];
    if (handlers.length === 0) {
      return [];
    }

    const fullContext: HookContext = { event, ...context };
    const messages: string[] = [];

    for (const handler of handlers) {
      try {
        const result = await handler(fullContext);
        if (result?.message) {
          messages.push(result.message);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Hook handler failed", {
          event,
          error: errorMessage,
        });
      }
    }

    return messages;
  }

  /**
   * Execute a shell command as a hook.
   * Context is passed as JSON via the HOOK_CONTEXT environment variable.
   */
  private executeShellHook(command: string, context: HookContext): Promise<HookResult | void> {
    return new Promise((resolve) => {
      const contextJson = JSON.stringify({
        event: context.event,
        toolName: context.toolName,
        filePath: context.filePath,
      });

      const parts = command.split(/\s+/);
      const cmd = parts[0];
      const args = [...parts.slice(1), context.filePath ?? ""].filter(Boolean);

      if (!cmd) {
        resolve();
        return;
      }

      execFile(
        cmd,
        args,
        {
          timeout: SHELL_HOOK_TIMEOUT_MS,
          env: {
            ...process.env,
            HOOK_CONTEXT: contextJson,
          },
          maxBuffer: 1024 * 1024, // 1MB
        },
        (error, stdout, stderr) => {
          if (error) {
            logger.warn("Shell hook failed", {
              command,
              error: error.message,
              stderr: stderr?.trim(),
            });
            resolve({ message: `Hook error (${command}): ${error.message}` });
            return;
          }

          const output = stdout.trim();
          if (output) {
            resolve({ message: output });
          } else {
            resolve();
          }
        }
      );
    });
  }
}
