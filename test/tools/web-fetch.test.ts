import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebFetchTool, cache, htmlToMarkdown } from "../../src/tools/web-fetch.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(body: string, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(body),
  };
}

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <article>
    <h1>Hello World</h1>
    <p>This is a test paragraph with some <strong>bold</strong> and <em>italic</em> text.</p>
    <ul>
      <li>Item one</li>
      <li>Item two</li>
    </ul>
  </article>
</body>
</html>
`;

describe("WebFetchTool", () => {
  let tool: WebFetchTool;

  beforeEach(() => {
    tool = new WebFetchTool();
    cache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cache.clear();
  });

  it("returns error when url is missing", async () => {
    const result = await tool.execute({ url: "" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Missing required field 'url'");
  });

  it("returns error for invalid URL", async () => {
    const result = await tool.execute({ url: "not-a-url" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Invalid URL");
  });

  it("returns error for non-http URL", async () => {
    const result = await tool.execute({ url: "ftp://example.com/file" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Invalid URL");
  });

  it("converts HTML to markdown successfully", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SAMPLE_HTML));

    const result = await tool.execute({ url: "https://example.com/page" });
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Hello World");
    expect(result.content).toContain("**bold**");
    expect(result.content).toContain("_italic_");
    expect(result.content).toContain("Source: https://example.com/page");
  });

  it("returns cached content on second request", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SAMPLE_HTML));

    const url = "https://example.com/cached";
    const first = await tool.execute({ url });
    const second = await tool.execute({ url });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(second.content).toBe(first.content);
  });

  it("re-fetches after cache expires", async () => {
    mockFetch.mockResolvedValue(mockResponse(SAMPLE_HTML));

    const url = "https://example.com/expire";
    await tool.execute({ url });

    // Manually expire the cache entry
    const entry = cache.get(url);
    if (entry) {
      entry.timestamp = Date.now() - 16 * 60 * 1000; // 16 minutes ago
    }

    await tool.execute({ url });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles HTTP error status", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse("Not Found", 404, "Not Found"));

    const result = await tool.execute({ url: "https://example.com/missing" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("HTTP 404");
  });

  it("handles fetch timeout", async () => {
    const timeoutError = new DOMException("The operation was aborted", "TimeoutError");
    mockFetch.mockRejectedValueOnce(timeoutError);

    const result = await tool.execute({ url: "https://example.com/slow" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");
    expect(result.content).toContain("10s");
  });

  it("handles network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await tool.execute({ url: "https://example.com/down" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Failed to fetch");
    expect(result.content).toContain("ECONNREFUSED");
  });

  it("sets proper User-Agent header", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SAMPLE_HTML));

    await tool.execute({ url: "https://example.com/agent" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/agent",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("BombaCode") }),
      }),
    );
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("web-fetch");
    expect(tool.category).toBe("readonly");
    expect(tool.inputSchema.required).toContain("url");
  });
});

describe("htmlToMarkdown", () => {
  it("falls back to body text when Readability returns null", () => {
    // Minimal HTML that Readability may reject
    const html = "<html><body><p>Simple text</p></body></html>";
    const result = htmlToMarkdown(html, "https://example.com");
    expect(result).toContain("Simple text");
    expect(result).toContain("Source: https://example.com");
  });

  it("converts tables to GFM format", () => {
    const html = `
      <html><body><article>
        <p>Paragraph for readability score. This is enough text to make it parse correctly.</p>
        <p>Another paragraph with sufficient content for the readability algorithm.</p>
        <p>Yet another paragraph to boost the content score for Readability.</p>
        <table>
          <thead><tr><th>Name</th><th>Value</th></tr></thead>
          <tbody><tr><td>A</td><td>1</td></tr></tbody>
        </table>
      </article></body></html>
    `;
    const result = htmlToMarkdown(html, "https://example.com");
    expect(result).toContain("Name");
    expect(result).toContain("Value");
  });
});
