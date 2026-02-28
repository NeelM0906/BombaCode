import { readFile } from "node:fs/promises";
import { BaseTool, formatLineNumbers, truncateLines } from "./base-tool.js";
import { resolveToolPath } from "../security/path-validator.js";

const BINARY_SAMPLE_BYTES = 8 * 1024;
const DEFAULT_LINE_LIMIT = 2_000;

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.floor(value);
  if (rounded <= 0) {
    return fallback;
  }

  return rounded;
}

function isLikelyBinary(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.length, BINARY_SAMPLE_BYTES));
  return sample.includes(0);
}

export class ReadTool extends BaseTool {
  private readonly projectRoot: string;

  name = "read";
  description = [
    "Read the contents of a file at the given path.",
    "Returns line-numbered content.",
    "For large files, use offset and limit to read specific sections.",
    "Binary files return a size summary instead of content.",
    "Maximum 2000 lines per call unless limit is specified.",
  ].join(" ");
  category = "readonly" as const;
  inputSchema = {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute or relative path to the file." },
      offset: { type: "number", description: "1-based line number to start from." },
      limit: { type: "number", description: "Maximum number of lines to return." },
    },
    required: ["file_path"],
    additionalProperties: false,
  };

  constructor(projectRoot = process.cwd()) {
    super();
    this.projectRoot = projectRoot;
  }

  async run(input: Record<string, unknown>) {
    const filePath = typeof input.file_path === "string" ? input.file_path.trim() : "";

    if (!filePath) {
      return {
        content: "Error: Missing required field 'file_path'.",
        isError: true,
      };
    }

    const offset = parsePositiveInteger(input.offset, 1);
    const limit = parsePositiveInteger(input.limit, DEFAULT_LINE_LIMIT);

    try {
      const resolvedPath = await resolveToolPath(filePath, process.cwd(), this.projectRoot);
      const raw = await readFile(resolvedPath);
      if (isLikelyBinary(raw)) {
        return {
          content: `Binary file detected (${raw.byteLength.toLocaleString()} bytes). Use a specific tool to process binary files.`,
          isError: false,
        };
      }

      const fullText = raw.toString("utf8");
      const allLines = fullText.split("\n");
      const startIndex = Math.max(0, offset - 1);
      const selectedLines = allLines.slice(startIndex, startIndex + limit);
      const selectedContent = selectedLines.join("\n");
      const truncatedLines = truncateLines(selectedContent);

      return {
        content: formatLineNumbers(truncatedLines, startIndex + 1),
        isError: false,
      };
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError?.code === "ENOENT") {
        return {
          content: `Error: File not found: ${filePath}`,
          isError: true,
        };
      }

      if (nodeError?.code === "EACCES") {
        return {
          content: `Error: Permission denied: ${filePath}`,
          isError: true,
        };
      }

      if (nodeError?.code === "EISDIR") {
        return {
          content: `Error: Path is a directory, use glob instead: ${filePath}`,
          isError: true,
        };
      }

      return {
        content: `Error: Cannot read file ${filePath}: ${nodeError?.message || String(error)}`,
        isError: true,
      };
    }
  }
}
