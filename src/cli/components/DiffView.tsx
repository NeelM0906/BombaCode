import React from "react";
import { Box, Text } from "ink";

interface DiffViewProps {
  filePath: string;
  diff: string;
  maxLines?: number;
}

export const DiffView: React.FC<DiffViewProps> = ({ filePath, diff, maxLines = 20 }) => {
  const lines = diff.split("\n");
  const hiddenLineCount = Math.max(0, lines.length - maxLines);
  const visibleLines = lines.slice(0, maxLines);

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
      {hiddenLineCount > 0 ? <Text dimColor>[{hiddenLineCount} more lines...]</Text> : null}
    </Box>
  );
};
