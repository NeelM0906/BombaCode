import { spawn } from "node:child_process";
import { BaseTool } from "./base-tool.js";
import type { ToolExecuteResult } from "./base-tool.js";
import { isDangerousCommand } from "../security/command-filter.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 30_000;
const PWD_MARKER = "__BOMBA_PWD__";

function clampTimeout(timeout: unknown): number {
  if (typeof timeout !== "number" || !Number.isFinite(timeout)) {
    return DEFAULT_TIMEOUT_MS;
  }

  const rounded = Math.floor(timeout);
  if (rounded <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(rounded, MAX_TIMEOUT_MS);
}

function truncateCommandOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) {
    return output;
  }

  const headSize = 14_000;
  const tailSize = 14_000;
  const skipped = output.length - headSize - tailSize;

  return [
    output.slice(0, headSize),
    `\n[...truncated ${skipped} characters...]\n`,
    output.slice(-tailSize),
  ].join("");
}

export class BashTool extends BaseTool {
  name = "bash";
  description = [
    "Execute a bash command in the shell.",
    "The working directory persists between calls.",
    "Commands default to a 120 second timeout (max 600 seconds).",
  ].join(" ");
  category = "execute" as const;
  inputSchema = {
    type: "object",
    properties: {
      command: { type: "string", description: "The bash command to execute." },
      timeout: { type: "number", description: "Timeout in milliseconds." },
    },
    required: ["command"],
    additionalProperties: false,
  };

  private currentWorkingDirectory: string;

  constructor(cwd = process.cwd()) {
    super();
    this.currentWorkingDirectory = cwd;
  }

  async run(input: Record<string, unknown>): Promise<ToolExecuteResult> {
    const command = typeof input.command === "string" ? input.command.trim() : "";
    const timeout = clampTimeout(input.timeout);

    if (!command) {
      return {
        content: "Error: Missing required field 'command'.",
        isError: true,
      };
    }

    const commandSafety = isDangerousCommand(command);
    if (commandSafety.dangerous) {
      return {
        content: `Error: Command blocked by security policy. ${commandSafety.reason ?? ""}`.trim(),
        isError: true,
      };
    }

    const wrappedCommand = `{ ${command}; __bomba_status=$?; printf '\\n${PWD_MARKER}%s' \"$PWD\"; exit $__bomba_status; }`;

    return await new Promise<ToolExecuteResult>((resolve) => {
      const child = spawn("bash", ["-lc", wrappedCommand], {
        cwd: this.currentWorkingDirectory,
        env: {
          ...process.env,
          TERM: "dumb",
        },
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeout);

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          content: `Error: Failed to execute command: ${error.message}`,
          isError: true,
        });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({
            content: `Error: Command timed out after ${Math.floor(timeout / 1000)} seconds`,
            isError: true,
          });
          return;
        }

        const markerIndex = stdout.lastIndexOf(PWD_MARKER);
        if (markerIndex !== -1) {
          const markerValue = stdout.slice(markerIndex + PWD_MARKER.length).trim();
          if (markerValue.length > 0) {
            this.currentWorkingDirectory = markerValue;
          }
          stdout = stdout.slice(0, markerIndex).trimEnd();
        }

        const combinedOutput = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
        const truncated = truncateCommandOutput(combinedOutput);
        const statusCode = typeof exitCode === "number" ? exitCode : 1;

        resolve({
          content: `Exit code: ${statusCode}\n\nOutput:\n${truncated}`,
          isError: statusCode !== 0,
        });
      });
    });
  }
}
