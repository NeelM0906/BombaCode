import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @tavily/core before importing the tool
vi.mock("@tavily/core", () => {
  const mockSearch = vi.fn();
  return {
    tavily: vi.fn(() => ({ search: mockSearch })),
    __mockSearch: mockSearch,
  };
});

import { tavily } from "@tavily/core";
import { WebSearchTool } from "../../src/tools/web-search.js";

function getMockSearch() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tavily as any)().__mockSearch ?? (tavily() as any).search;
}

describe("WebSearchTool", () => {
  let tool: WebSearchTool;
  const originalEnv = process.env.TAVILY_API_KEY;

  beforeEach(() => {
    tool = new WebSearchTool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TAVILY_API_KEY = originalEnv;
    } else {
      delete process.env.TAVILY_API_KEY;
    }
  });

  it("returns error when query is missing", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    const result = await tool.execute({ query: "" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Missing required field 'query'");
  });

  it("returns error when TAVILY_API_KEY is not set", async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await tool.execute({ query: "test query" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("TAVILY_API_KEY");
    expect(result.content).toContain("https://tavily.com");
  });

  it("formats successful search results as numbered list", async () => {
    process.env.TAVILY_API_KEY = "test-key";

    const mockClient = tavily({ apiKey: "test-key" });
    const mockSearch = mockClient.search as ReturnType<typeof vi.fn>;
    mockSearch.mockResolvedValueOnce({
      results: [
        { title: "First Result", url: "https://example.com/1", content: "First snippet" },
        { title: "Second Result", url: "https://example.com/2", content: "Second snippet" },
      ],
    });

    const result = await tool.execute({ query: "test query" });
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1. First Result");
    expect(result.content).toContain("https://example.com/1");
    expect(result.content).toContain("First snippet");
    expect(result.content).toContain("2. Second Result");
    expect(result.content).toContain("https://example.com/2");
    expect(result.content).toContain("Second snippet");
  });

  it("handles empty results", async () => {
    process.env.TAVILY_API_KEY = "test-key";

    const mockClient = tavily({ apiKey: "test-key" });
    const mockSearch = mockClient.search as ReturnType<typeof vi.fn>;
    mockSearch.mockResolvedValueOnce({ results: [] });

    const result = await tool.execute({ query: "obscure query" });
    expect(result.isError).toBe(false);
    expect(result.content).toContain("No results found");
  });

  it("handles API errors gracefully", async () => {
    process.env.TAVILY_API_KEY = "test-key";

    const mockClient = tavily({ apiKey: "test-key" });
    const mockSearch = mockClient.search as ReturnType<typeof vi.fn>;
    mockSearch.mockRejectedValueOnce(new Error("Rate limit exceeded"));

    const result = await tool.execute({ query: "test query" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Web search failed");
    expect(result.content).toContain("Rate limit exceeded");
  });

  it("respects maxResults parameter", async () => {
    process.env.TAVILY_API_KEY = "test-key";

    const mockClient = tavily({ apiKey: "test-key" });
    const mockSearch = mockClient.search as ReturnType<typeof vi.fn>;
    mockSearch.mockResolvedValueOnce({ results: [{ title: "A", url: "https://a.com", content: "a" }] });

    await tool.execute({ query: "test", maxResults: 3 });

    expect(mockSearch).toHaveBeenCalledWith("test", expect.objectContaining({ maxResults: 3 }));
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("web-search");
    expect(tool.category).toBe("readonly");
    expect(tool.inputSchema.required).toContain("query");
  });
});
