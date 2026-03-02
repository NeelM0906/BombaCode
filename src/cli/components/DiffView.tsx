import React from "react";
import { Box, Text } from "ink";

interface DiffViewProps {
  filePath: string;
  diff: string;
  maxLines?: number;
  showOverflowHint?: boolean;
}

export const DiffView: React.FC<DiffViewProps> = ({ filePath, diff, maxLines = 20, showOverflowHint = true }) => {
  const lines = diff.split("\n");
  const visibleLines = maxLines === Infinity ? lines : lines.slice(0, maxLines);
  const hiddenLineCount = maxLines === Infinity ? 0 : Math.max(0, lines.length - maxLines);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{filePath}</Text>
      {visibleLines.map((line, index) => {
        if (line.startsWith("+++ ") || line.startsWith("--- ")) {
          return (
            <Text key={`${index}-${line}`} dimColor>
              {line}
            </Text>
          );
        }

        if (line.startsWith("@@")) {
          return (
            <Text key={`${index}-${line}`} color="cyan">
              {line}
            </Text>
          );
        }

        if (line.startsWith("+") && !line.startsWith("+++")) {
          return (
            <Text key={`${index}-${line}`} color="green">
              {line}
            </Text>
          );
        }

        if (line.startsWith("-") && !line.startsWith("---")) {
          return (
            <Text key={`${index}-${line}`} color="red">
              {line}
            </Text>
          );
        }

        return (
          <Text key={`${index}-${line}`} dimColor>
            {line}
          </Text>
        );
      })}
      {hiddenLineCount > 0 && showOverflowHint ? <Text dimColor>[{hiddenLineCount} more lines...]</Text> : null}
    </Box>
  );
};
