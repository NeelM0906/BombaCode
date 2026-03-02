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
    return {
      headerLine: lines[0],
      bodyLines: lines.slice(1).filter((line) => line.trim().length > 0),
    };
  }

  return { headerLine: null, bodyLines: lines };
}

export interface TextPreview {
  headerLine: string | null;
  visibleLines: string[];
  hiddenCount: number;
  footer: string | null;
  isCollapsible: boolean;
}

export interface EditPreview {
  summaryText: string;
  diff: string | null;
  maxLines: number;
  hiddenCount: number;
  footer: string | null;
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

export function buildFooter(
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

export function buildTextPreview(
  content: string,
  toolName: string,
  isExpanded: boolean,
  isError: boolean
): TextPreview {
  if (isError) {
    return {
      headerLine: null,
      visibleLines: content.split("\n"),
      hiddenCount: 0,
      footer: null,
      isCollapsible: false,
    };
  }

  const { headerLine, bodyLines } = splitToolContent(content, toolName);
  const lineCount = countNonEmptyLines(bodyLines);
  const isCollapsible = lineCount > COLLAPSED_LINE_LIMIT;

  if (!isCollapsible) {
    return {
      headerLine,
      visibleLines: bodyLines,
      hiddenCount: 0,
      footer: null,
      isCollapsible: false,
    };
  }

  const hiddenCount = Math.max(0, lineCount - COLLAPSED_LINE_LIMIT);
  const visibleLines = isExpanded ? bodyLines : bodyLines.slice(0, COLLAPSED_LINE_LIMIT);
  const footer = buildFooter(toolName, hiddenCount, isExpanded, headerLine !== null);

  return {
    headerLine,
    visibleLines,
    hiddenCount,
    footer,
    isCollapsible: true,
  };
}

export function buildEditPreview(result: ToolResult, isExpanded: boolean): EditPreview {
  const diff = extractDiff(result);

  if (!diff) {
    return {
      summaryText: result.content,
      diff: null,
      maxLines: COLLAPSED_LINE_LIMIT,
      hiddenCount: 0,
      footer: null,
    };
  }

  const diffLineCount = countNonEmptyLines(diff.split("\n"));
  const hiddenCount = Math.max(0, diffLineCount - COLLAPSED_LINE_LIMIT);
  const footer = buildFooter("edit", hiddenCount, isExpanded, false);

  return {
    summaryText: extractEditSummary(result),
    diff,
    maxLines: isExpanded ? Infinity : COLLAPSED_LINE_LIMIT,
    hiddenCount,
    footer,
  };
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

      {isRunning ? <BusySpinner label="Running tool..." /> : null}

      {!isRunning && result ? (
        <>
          {toolCall.name === "read" ? <Text dimColor>{summarizeReadOutput(result)}</Text> : null}

          {toolCall.name === "edit" && !result.isError
            ? (() => {
                const editPreview = buildEditPreview(result, isExpanded);

                return (
                  <>
                    {editPreview.summaryText ? <Text>{editPreview.summaryText}</Text> : null}
                    {editPreview.diff ? (
                      <DiffView
                        filePath={String(toolCall.input.file_path ?? "(unknown)")}
                        diff={editPreview.diff}
                        maxLines={editPreview.maxLines}
                      />
                    ) : null}
                    {editPreview.footer ? <Text dimColor>{editPreview.footer}</Text> : null}
                  </>
                );
              })()
            : null}

          {toolCall.name !== "read" && toolCall.name !== "edit"
            ? (() => {
                const preview = buildTextPreview(result.content, toolCall.name, isExpanded, result.isError);

                return (
                  <>
                    {preview.headerLine ? <Text>{preview.headerLine}</Text> : null}
                    {preview.visibleLines.length > 0 ? <Text>{preview.visibleLines.join("\n")}</Text> : null}
                    {preview.footer ? <Text dimColor>{preview.footer}</Text> : null}
                  </>
                );
              })()
            : null}
        </>
      ) : null}
    </Box>
  );
};
