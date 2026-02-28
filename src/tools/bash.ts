import { exec } from "node:child_process";
import { promisify } from "node:util";
import { BaseTool } from "./base-tool.js";

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  readonly name = "bash";
  readonly description = "Execute a shell command.";
  private currentWorkingDirectory: string;

  constructor(cwd = process.cwd()) {
    super();
    this.currentWorkingDirectory = cwd;
  }

  async run(input: Record<string, unknown>): Promise<string> {
    const command = String(input.command ?? "");
    if (!command) {
      throw new Error("Missing command");
    }
    const { stdout, stderr } = await execAsync(command, { cwd: this.currentWorkingDirectory });
    return `${stdout}${stderr}`.trim();
  }
}
