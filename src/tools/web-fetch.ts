import { BaseTool } from "./base-tool.js";

export class WebFetchTool extends BaseTool {
  readonly name = "web-fetch";
  readonly description = "Fetch URL content.";

  async run(input: Record<string, unknown>): Promise<string> {
    const url = String(input.url ?? "");
    if (!url) {
      throw new Error("Missing url");
    }
    const response = await fetch(url);
    return response.text();
  }
}
