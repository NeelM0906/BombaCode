import React from "react";
import { Box, Text, Static } from "ink";
import { MarkdownText } from "./MarkdownRenderer.js";
import type { Message } from "../../llm/types.js";

interface MessageListProps {
  messages: Message[];
  streamingText?: string;
}

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  if (message.role === "user") {
    return (
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Text color="green" bold>You:</Text>
        <Box marginLeft={2}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    );
  }

  if (message.role === "assistant") {
    return (
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Text color="cyan" bold>BombaCode:</Text>
        <Box marginLeft={2}>
          <MarkdownText content={message.content} />
        </Box>
      </Box>
    );
  }

  // Tool output is rendered in a dedicated panel.
  if (message.role === "tool") {
    return null;
  }

  return null;
};

export const MessageList: React.FC<MessageListProps> = ({ messages, streamingText }) => {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Completed messages — Static prevents re-rendering */}
      <Static items={messages.map((msg, i) => ({ id: String(i), msg }))}>
        {({ id, msg }) => (
          <Box key={id}>
            <MessageBubble message={msg} />
          </Box>
        )}
      </Static>

      {/* Currently streaming message */}
      {streamingText !== undefined && streamingText.length > 0 && (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text color="cyan" bold>BombaCode:</Text>
          <Box marginLeft={2}>
            <MarkdownText content={streamingText} />
            <Text color="gray">█</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
