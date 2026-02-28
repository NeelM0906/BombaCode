import { BaseTool } from "./base-tool.js";

export class TodoTool extends BaseTool {
  readonly name = "todo";
  readonly description = "Track tasks placeholder.";

  async run(): Promise<string> {
    return "Todo tracking is handled in UI state for now.";
  }
}
