import { readFile } from "node:fs/promises";
import { BaseTool } from "./base-tool.js";

export class ReadTool extends BaseTool {
  readonly name = "read";
  readonly description = "Read a file from disk.";

  async run(input: Record<string, unknown>): Promise<string> {
    const path = String(input.path ?? "");
    if (!path) {
      throw new Error("Missing path");
    }
    return readFile(path, "utf8");
  }
}
