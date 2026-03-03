import { tavily } from "@tavily/core";
import { BaseTool, truncateResult } from "./base-tool.js";

const MAX_OUTPUT_CHARS = 4_000;

export class WebSearchTool extends BaseTool {
  name = "web-search";
  description =
    "Search the web using the Tavily API. Returns titles, URLs, and snippets for the top results.";
  category = "readonly" as const;
  inputSchema = {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default 5).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  };

  async run(input: Record<string, unknown>) {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) {
      return { content: "Error: Missing required field 'query'.", isError: true };
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return {
        content:
          "Error: TAVILY_API_KEY environment variable is not set. " +
          "Get a free API key at https://tavily.com and set it with: export TAVILY_API_KEY=tvly-...",
        isError: true,
      };
    }

    const maxResults =
      typeof input.maxResults === "number" && input.maxResults > 0
        ? Math.min(Math.floor(input.maxResults), 20)
        : 5;

    try {
      const client = tavily({ apiKey });
      const response = await client.search(query, {
        searchDepth: "basic",
        maxResults,
      });

      if (!response.results || response.results.length === 0) {
        return "No results found.";
      }

      const formatted = response.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content}`)
        .join("\n\n");

      return truncateResult(formatted, MAX_OUTPUT_CHARS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: `Error: Web search failed: ${message}`, isError: true };
    }
  }
}
