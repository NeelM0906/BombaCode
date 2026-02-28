import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { BaseTool } from "./base-tool.js";

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split("\n").length;
}

export class WriteTool extends BaseTool {
  name = "write";
  description = [
    "Write content to a file.",
    "Creates the file and any parent directories if they don't exist.",
    "If the file already exists, it will be overwritten.",
    "Always prefer 'edit' over 'write' for modifying existing files.",
  ].join(" ");
  category = "write" as const;
  inputSchema = {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Path to write to." },
      content: { type: "string", description: "Full file content to write." },
    },
    required: ["file_path", "content"],
    additionalProperties: false,
  };

  async run(input: Record<string, unknown>) {
    const filePath = typeof input.file_path === "string" ? input.file_path.trim() : "";
    const content = typeof input.content === "string" ? input.content : "";

    if (!filePath) {
      return {
        content: "Error: Missing required field 'file_path'.",
        isError: true,
      };
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });

      const tempPath = `${filePath}.tmp.${randomUUID()}`;
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, filePath);

      const lineCount = countLines(content);
      const warning = content.length === 0 ? " (warning: empty content)" : "";

      return {
        content: `Successfully wrote ${lineCount} lines to ${filePath}${warning}`,
        isError: false,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Error: Cannot write to ${filePath}: ${message}`,
        isError: true,
      };
    }
  }
}
