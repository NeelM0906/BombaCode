import { execFile } from "node:child_process";
import type { HookContext, HookHandler, HookResult } from "../types.js";

/** Timeout for lint commands (10 seconds). */
const LINT_TIMEOUT_MS = 10_000;

/**
 * Creates an opt-in post_edit hook that runs a linter/formatter on edited files.
 *
 * @param lintCommand - The lint/format command to run (e.g. "npx prettier --write")
 * @returns A HookHandler that runs the command against the edited file
 */
export function createAutoLintHook(lintCommand: string): HookHandler {
  return async (context: HookContext): Promise<HookResult | void> => {
    if (!context.filePath) {
      return;
    }

    const parts = lintCommand.split(/\s+/);
    const cmd = parts[0];
    const args = [...parts.slice(1), context.filePath];

    if (!cmd) {
      return;
    }

    return new Promise<HookResult | void>((resolve) => {
      execFile(
        cmd,
        args,
        {
          timeout: LINT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024, // 1MB
        },
        (error, stdout, stderr) => {
          if (error) {
            const errorOutput = stderr?.trim() || error.message;
            resolve({ message: `Lint failed (${lintCommand}): ${errorOutput}` });
            return;
          }

          const output = stdout.trim();
          if (output) {
            resolve({ message: `Lint: ${output}` });
          } else {
            resolve();
          }
        }
      );
    });
  };
}
