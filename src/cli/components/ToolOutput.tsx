import React from "react";
import { Box, Text } from "ink";
import type { ToolCall, ToolResult } from "../../llm/types.js";
import { BusySpinner } from "./Spinner.js";
import { DiffView } from "./DiffView.js";

interface ToolOutputProps {
  toolCall: ToolCall;
  result?: ToolResult;
  isRunning: boolean;
  isExpanded?: boolean;
}

export const COLLAPSED_LINE_LIMIT = 5;

export function summarizeReadOutput(result: ToolResult): string {
  const lineCount = result.content.length === 0 ? 0 : result.content.split("\n").length;
  return `Read ${lineCount} lines`;
}

export function splitToolContent(
  content: string,
  toolName: string
): {
  headerLine: string | null;
  bodyLines: string[];
} {
  const lines = content.split("\n");
  if ((toolName === "glob" || toolName === "grep") && lines[0]?.startsWith("Found")) {
    return { headerLine: lines[0], bodyLines: lines.slice(1).filter((line) => line.trim().length > 0) };
  }

  return { headerLine: null, bodyLines: lines };
}

function countNonEmptyLines(lines: string[]): number {
  return lines.filter((line) => line.trim().length > 0).length;
}

function extractDiff(result: ToolResult): string | null {
  const startIndex = result.content.indexOf("@@");
  if (startIndex === -1) {
    return null;
  }

  return result.content.slice(startIndex);
}

function extractEditSummary(result: ToolResult): string {
  const startIndex = result.content.indexOf("@@");
  if (startIndex === -1) {
    return result.content;
  }

  return result.content.slice(0, startIndex).trimEnd();
}

function buildFooter(
  toolName: string,
  hiddenCount: number,
  isExpanded: boolean,
  hasHeader: boolean
): string | null {
  if (hiddenCount <= 0) {
    return null;
  }

  if (isExpanded) {
    return "▾ Esc to collapse";
  }

  const noun = toolName === "glob" || (toolName === "grep" && hasHeader) ? "items" : "lines";
  return `▸ ${hiddenCount} more ${noun} — Ctrl+O to expand`;
}

export const ToolOutput: React.FC<ToolOutputProps> = ({
  toolCall,
  result,
  isRunning,
  isExpanded = false,
}) => {
  const borderColor = isRunning ? "yellow" : result?.isError ? "red" : "green";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} marginTop={1} paddingX={1}>
      <Text bold color={borderColor}>
        {toolCall.name}
      </Text>

      {isRunning ? (
        <BusySpinner label="Running tool..." />
      ) : null}

      {!isRunning && result ? (
        <>
          {toolCall.name === "read" ? <Text dimColor>{summarizeReadOutput(result)}</Text> : null}

          {toolCall.name !== "read" && result.isError ? <Text>{result.content}</Text> : null}

          {toolCall.name === "edit" && !result.isError ? (
            <>
              {extractEditSummary(result) ? <Text>{extractEditSummary(result)}</Text> : null}
              {extractDiff(result) ? (
                <>
                  <DiffView
                    filePath={String(toolCall.input.file_path ?? "(unknown)")}
                    diff={extractDiff(result) ?? ""}
                    maxLines={isExpanded ? Infinity : COLLAPSED_LINE_LIMIT}
                  />
                  {(() => {
                    const diff = extractDiff(result) ?? "";
                    const diffLineCount = countNonEmptyLines(diff.split("\n"));
                    const hiddenCount = Math.max(0, diffLineCount - COLLAPSED_LINE_LIMIT);
                    const footer = buildFooter(toolCall.name, hiddenCount, isExpanded, false);
                    return footer ? <Text dimColor>{footer}</Text> : null;
                  })()}
                </>
              ) : null}
            </>
          ) : null}

          {toolCall.name !== "read" && toolCall.name !== "edit" && !result.isError
            ? (() => {
                const { headerLine, bodyLines } = splitToolContent(result.content, toolCall.name);
                const lineCount = countNonEmptyLines(bodyLines);
                const isCollapsible = lineCount > COLLAPSED_LINE_LIMIT;
                const visibleLines = isCollapsible && !isExpanded ? bodyLines.slice(0, COLLAPSED_LINE_LIMIT) : bodyLines;
                const hiddenCount = Math.max(0, lineCount - COLLAPSED_LINE_LIMIT);
                const footer = isCollapsible
                  ? buildFooter(toolCall.name, hiddenCount, isExpanded, headerLine !== null)
                  : null;

                return (
                  <>
                    {headerLine ? <Text>{headerLine}</Text> : null}
                    <Text>{visibleLines.join("\n")}</Text>
                    {footer ? <Text dimColor>{footer}</Text> : null}
                  </>
                );
              })()
            : null}
        </>
      ) : null}
    </Box>
  );
};
