import { BaseTool } from "./base-tool.js";

export class WebSearchTool extends BaseTool {
  readonly name = "web-search";
  readonly description = "Web search placeholder tool.";

  async run(): Promise<string> {
    return "Web search not yet implemented.";
  }
}
