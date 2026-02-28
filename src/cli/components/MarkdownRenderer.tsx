import React from "react";
import { Text } from "ink";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

// Configure marked to use terminal renderer (markedTerminal is a marked extension)
marked.use(
  markedTerminal({
    showSectionPrefix: false,
    reflowText: true,
    width: Math.min(process.stdout.columns || 80, 120),
    tab: 2,
  }) as Parameters<typeof marked.use>[0]
);

interface MarkdownTextProps {
  content: string;
}

/**
 * Render markdown content formatted for the terminal
 */
export const MarkdownText: React.FC<MarkdownTextProps> = ({ content }) => {
  // marked.parse is synchronous with { async: false }
  const rendered = marked.parse(content, { async: false }) as string;

  // Trim trailing newlines that marked tends to add
  const trimmed = rendered.replace(/\n+$/, "");

  return <Text>{trimmed}</Text>;
};
