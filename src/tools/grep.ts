import { exec } from "node:child_process";
import { promisify } from "node:util";
import { BaseTool } from "./base-tool.js";

const execAsync = promisify(exec);

export class GrepTool extends BaseTool {
  readonly name = "grep";
  readonly description = "Search file contents using ripgrep.";

  async run(input: Record<string, unknown>): Promise<string> {
    const pattern = String(input.pattern ?? "");
    if (!pattern) {
      throw new Error("Missing pattern");
    }
    const { stdout } = await execAsync(`rg --line-number --hidden ${JSON.stringify(pattern)} .`, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 10,
    });
    return stdout;
  }
}
