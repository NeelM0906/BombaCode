import { readFile, writeFile } from "node:fs/promises";
import { BaseTool } from "./base-tool.js";

export class EditTool extends BaseTool {
  readonly name = "edit";
  readonly description = "Edit file content using string replacement.";

  async run(input: Record<string, unknown>): Promise<string> {
    const path = String(input.path ?? "");
    const from = String(input.from ?? "");
    const to = String(input.to ?? "");
    if (!path || !from) {
      throw new Error("Missing edit arguments");
    }

    const current = await readFile(path, "utf8");
    const updated = current.replace(from, to);
    if (current === updated) {
      return "No changes applied";
    }

    await writeFile(path, updated, "utf8");
    return `Updated ${path}`;
  }
}
