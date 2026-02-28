import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { BaseTool } from "./base-tool.js";
import { resolveToolPath } from "../security/path-validator.js";

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split("\n").length;
}

export class WriteTool extends BaseTool {
  private readonly projectRoot: string;

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

  constructor(projectRoot = process.cwd()) {
    super();
    this.projectRoot = projectRoot;
  }

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
      const resolvedPath = await resolveToolPath(filePath, process.cwd(), this.projectRoot);
      await mkdir(dirname(resolvedPath), { recursive: true });

      const tempPath = `${resolvedPath}.tmp.${randomUUID()}`;
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, resolvedPath);

      const lineCount = countLines(content);
      const warning = content.length === 0 ? " (warning: empty content)" : "";

      return {
        content: `Successfully wrote ${lineCount} lines to ${resolvedPath}${warning}`,
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
