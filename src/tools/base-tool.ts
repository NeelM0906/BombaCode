export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolExecuteResult {
  content: string;
  isError: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category: "readonly" | "write" | "execute" | "interactive";
  execute(input: ToolInput): Promise<ToolExecuteResult>;
}

export abstract class BaseTool implements Tool {
  abstract name: string;
  description = "";
  inputSchema: Record<string, unknown> = {};
  category: "readonly" | "write" | "execute" | "interactive" = "readonly";

  protected abstract run(input: ToolInput): Promise<ToolExecuteResult | string>;

  async execute(input: ToolInput): Promise<ToolExecuteResult> {
    const result = await this.run(input);
    if (typeof result === "string") {
      return {
        content: result,
        isError: false,
      };
    }
    return result;
  }
}

export const MAX_RESULT_TOKENS = 30_000;
const MAX_LINE_LENGTH = 2_000;

export function truncateResult(content: string, maxChars = MAX_RESULT_TOKENS * 4): string {
  if (content.length <= maxChars) {
    return content;
  }

  const headSize = Math.floor(maxChars * 0.4);
  const tailSize = Math.floor(maxChars * 0.4);
  const head = content.slice(0, headSize);
  const tail = content.slice(-tailSize);
  const skipped = content.length - headSize - tailSize;

  return `${head}\n\n... [${skipped} characters truncated] ...\n\n${tail}`;
}

export function truncateLines(content: string, maxLineLength = MAX_LINE_LENGTH): string {
  return content
    .split("\n")
    .map((line) => {
      if (line.length <= maxLineLength) {
        return line;
      }

      return `${line.slice(0, maxLineLength)}... [truncated]`;
    })
    .join("\n");
}

export function formatLineNumbers(content: string, startLine = 1): string {
  const lines = content.split("\n");
  const maxWidth = String(startLine + lines.length - 1).length;

  return lines
    .map((line, index) => {
      const lineNumber = String(startLine + index).padStart(maxWidth);
      return `${lineNumber}\t${line}`;
    })
    .join("\n");
}
