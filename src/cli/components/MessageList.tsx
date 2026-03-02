import React from "react";
import { Box, Text } from "ink";
import { MarkdownText } from "./MarkdownRenderer.js";
import { ToolOutput } from "./ToolOutput.js";
import { buildToolResultMap } from "../utils/tool-result-map.js";
import type { Message, ToolCall, ToolResult } from "../../llm/types.js";

interface MessageListProps {
  messages: Message[];
  streamingText?: string;
  activeToolCalls?: Map<string, ToolCall>;
  toolResults?: Map<string, ToolResult>;
  expandedToolId?: string | null;
}

const UserMessage: React.FC<{ content: string }> = ({ content }) => (
  <Box flexDirection="column" marginTop={1} paddingX={1}>
    <Text color="green" bold>
      You:
    </Text>
    <Box marginLeft={2}>
      <Text>{content}</Text>
    </Box>
  </Box>
);

const AssistantMessage: React.FC<{ content: string }> = ({ content }) => (
  <Box flexDirection="column" marginTop={1} paddingX={1}>
    <Text color="cyan" bold>
      BombaCode:
    </Text>
    {content ? (
      <Box marginLeft={2}>
        <MarkdownText content={content} />
      </Box>
    ) : null}
  </Box>
);

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingText,
  activeToolCalls,
  toolResults,
  expandedToolId,
}) => {
  const resultMap = buildToolResultMap(messages, toolResults);

  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((message, index) => {
        if (message.role === "user") {
          return <UserMessage key={`user-${index}`} content={message.content} />;
        }

        if (message.role === "assistant") {
          return (
            <Box key={`assistant-${index}`} flexDirection="column">
              <AssistantMessage content={message.content} />

              {message.toolCalls?.map((toolCall) => {
                const result = resultMap.get(toolCall.id);
                const isRunning = !result && (activeToolCalls?.has(toolCall.id) ?? true);

                return (
                  <ToolOutput
                    key={`tool-${toolCall.id}`}
                    toolCall={toolCall}
                    result={result}
                    isRunning={isRunning}
                    isExpanded={expandedToolId === toolCall.id}
                  />
                );
              })}
            </Box>
          );
        }

        return null;
      })}

      {streamingText && streamingText.length > 0 ? (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          <Text color="cyan" bold>
            BombaCode:
          </Text>
          <Box marginLeft={2}>
            <MarkdownText content={streamingText} />
            <Text color="gray">█</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};
