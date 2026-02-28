import { BaseTool } from "./base-tool.js";

export class TaskTool extends BaseTool {
  readonly name = "task";
  readonly description = "Spawn a subtask placeholder.";

  async run(): Promise<string> {
    return "Sub-agent spawning is not implemented in Phase 1.";
  }
}
