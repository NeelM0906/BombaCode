import React from "react";
import { Box, Text } from "ink";
import type { ToolCall, ToolResult } from "../../llm/types.js";
import { BusySpinner } from "./Spinner.js";
import { DiffView } from "./DiffView.js";

interface ToolOutputProps {
  toolCall: ToolCall;
  result?: ToolResult;
  isRunning: boolean;
}

function summarizeReadOutput(result: ToolResult): string {
  const lineCount = result.content.length === 0 ? 0 : result.content.split("\n").length;
  return `Read ${lineCount} lines`;
}

function summarizeBashOutput(result: ToolResult): string {
  const lines = result.content.split("\n").slice(0, 5).join("\n");
  return lines;
}

function extractDiff(result: ToolResult): string | null {
  const startIndex = result.content.indexOf("@@");
  if (startIndex === -1) {
    return null;
  }

  return result.content.slice(startIndex);
}

export const ToolOutput: React.FC<ToolOutputProps> = ({ toolCall, result, isRunning }) => {
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
          {toolCall.name === "bash" ? <Text>{summarizeBashOutput(result)}</Text> : null}
          {toolCall.name !== "read" && toolCall.name !== "bash" ? <Text>{result.content}</Text> : null}

          {toolCall.name === "edit" && !result.isError ? (
            extractDiff(result) ? (
              <DiffView filePath={String(toolCall.input.file_path ?? "(unknown)")} diff={extractDiff(result) ?? ""} />
            ) : null
          ) : null}
        </>
      ) : null}
    </Box>
  );
};
