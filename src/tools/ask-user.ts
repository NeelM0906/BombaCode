import { BaseTool } from "./base-tool.js";

export class AskUserTool extends BaseTool {
  readonly name = "ask-user";
  readonly description = "Request user input.";

  async run(input: Record<string, unknown>): Promise<string> {
    return String(input.prompt ?? "No prompt provided");
  }
}
