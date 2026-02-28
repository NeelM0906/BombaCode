import { marked } from "marked";

export function renderMarkdownToText(markdown: string): string {
  return String(marked.parse(markdown, { async: false }));
}
