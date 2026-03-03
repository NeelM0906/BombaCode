import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { BaseTool, truncateResult } from "./base-tool.js";

const MAX_OUTPUT_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 15 * 60 * 1_000;
const USER_AGENT = "BombaCode/0.1 (CLI coding agent)";

interface CacheEntry {
  content: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function isValidUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

function htmlToMarkdown(html: string, url: string): string {
  const { document } = parseHTML(html);

  const reader = new Readability(document);
  const article = reader.parse();

  let contentHtml: string;
  if (article?.content) {
    contentHtml = article.content;
  } else {
    // Fallback: extract <body> text
    const body = document.querySelector("body");
    contentHtml = body?.innerHTML ?? html;
  }

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });
  turndown.use(gfm);

  let markdown = turndown.turndown(contentHtml);

  // Prepend title if available
  if (article?.title) {
    markdown = `# ${article.title}\n\n${markdown}`;
  }

  // Append source URL
  markdown += `\n\nSource: ${url}`;

  return markdown;
}

export class WebFetchTool extends BaseTool {
  name = "web-fetch";
  description =
    "Fetch a web page and convert it to readable markdown. Extracts main content using Readability.";
  category = "readonly" as const;
  inputSchema = {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch." },
    },
    required: ["url"],
    additionalProperties: false,
  };

  async run(input: Record<string, unknown>) {
    const url = typeof input.url === "string" ? input.url.trim() : "";
    if (!url) {
      return { content: "Error: Missing required field 'url'.", isError: true };
    }

    if (!isValidUrl(url)) {
      return {
        content: `Error: Invalid URL '${url}'. Must be an http:// or https:// URL.`,
        isError: true,
      };
    }

    // Check cache
    evictStaleEntries();
    const cached = cache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return truncateResult(cached.content, MAX_OUTPUT_CHARS);
    }

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });

      if (!response.ok) {
        return {
          content: `Error: HTTP ${response.status} ${response.statusText} fetching ${url}`,
          isError: true,
        };
      }

      const html = await response.text();
      const markdown = htmlToMarkdown(html, url);

      // Store in cache
      cache.set(url, { content: markdown, timestamp: Date.now() });

      return truncateResult(markdown, MAX_OUTPUT_CHARS);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        return {
          content: `Error: Request timed out after ${FETCH_TIMEOUT_MS / 1_000}s fetching ${url}`,
          isError: true,
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return { content: `Error: Failed to fetch ${url}: ${message}`, isError: true };
    }
  }
}

// Exported for testing
export { cache, CACHE_TTL_MS, htmlToMarkdown };
