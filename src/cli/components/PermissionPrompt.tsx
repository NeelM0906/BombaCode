import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { ToolCall } from "../../llm/types.js";

export type PermissionPromptDecision = "allowed" | "denied" | "always_allow";

interface PermissionPromptProps {
  toolCall: ToolCall;
  onDecision: (decision: PermissionPromptDecision) => void;
  timeoutMs?: number;
}

function buildActionLabel(toolCall: ToolCall): string {
  if (toolCall.name === "bash") {
    return `run: ${String(toolCall.input.command ?? "")}`;
  }

  if (typeof toolCall.input.file_path === "string") {
    return `${toolCall.name}: ${toolCall.input.file_path}`;
  }

  return toolCall.name;
}

export const PermissionPrompt: React.FC<PermissionPromptProps> = ({
  toolCall,
  onDecision,
  timeoutMs = 30_000,
}) => {
  useInput((input, key) => {
    if (key.escape) {
      onDecision("denied");
      return;
    }

    if (input === "y") {
      onDecision("allowed");
      return;
    }

    if (input === "a") {
      onDecision("always_allow");
      return;
    }

    if (input === "n") {
      onDecision("denied");
    }
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      onDecision("denied");
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [onDecision, timeoutMs]);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text bold color="yellow">
        Permission Required
      </Text>
      <Text>BombaCode wants to {buildActionLabel(toolCall)}</Text>
      <Text dimColor>[y] Allow once  [a] Always allow  [n] Deny  [Esc] Abort</Text>
    </Box>
  );
};
