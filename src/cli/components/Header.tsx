import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  model: string;
  tokens: number;
  cost: number;
  activeToolName?: string;
}

export const Header: React.FC<HeaderProps> = ({ model, tokens, cost, activeToolName }) => {
  // Shorten model name for display (e.g., "anthropic/claude-sonnet-4-5-20250929" → "claude-sonnet-4-5")
  const shortModel = model.includes("/")
    ? model.split("/")[1]?.replace(/-\d{8}$/, "") ?? model
    : model;

  return (
    <Box
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
    >
      <Text bold color="cyan">
        BombaCode
      </Text>
      <Text dimColor>
        {shortModel} | {tokens.toLocaleString()} tokens | ${cost.toFixed(4)}
      </Text>
      {activeToolName ? (
        <Text color="yellow">Tool: {activeToolName}</Text>
      ) : (
        <Text dimColor>No active tool</Text>
      )}
    </Box>
  );
};
