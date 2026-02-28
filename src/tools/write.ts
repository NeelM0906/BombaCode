import { writeFile } from "node:fs/promises";
import { BaseTool } from "./base-tool.js";

export class WriteTool extends BaseTool {
  readonly name = "write";
  readonly description = "Write a new file to disk.";

  async run(input: Record<string, unknown>): Promise<string> {
    const path = String(input.path ?? "");
    const content = String(input.content ?? "");
    if (!path) {
      throw new Error("Missing path");
    }
    await writeFile(path, content, "utf8");
    return `Wrote ${path}`;
  }
}
