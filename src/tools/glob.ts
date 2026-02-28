import fg from "fast-glob";
import { BaseTool } from "./base-tool.js";

export class GlobTool extends BaseTool {
  readonly name = "glob";
  readonly description = "Find files by glob patterns.";

  async run(input: Record<string, unknown>): Promise<string> {
    const pattern = String(input.pattern ?? "**/*");
    const matches = await fg(pattern, { cwd: process.cwd(), dot: true, onlyFiles: true });
    return matches.join("\n");
  }
}
