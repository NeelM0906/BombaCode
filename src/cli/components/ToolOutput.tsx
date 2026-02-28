import React from "react";
import { Box, Text } from "ink";

export interface ToolOutputItem {
  id: string;
  tool: string;
  content: string;
}

interface ToolOutputProps {
  item: ToolOutputItem;
  collapsed: boolean;
}

export const ToolOutput: React.FC<ToolOutputProps> = ({ item, collapsed }) => {
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round" borderColor="magenta">
      <Text color="magenta" bold>
        {item.tool}
      </Text>
      {collapsed ? (
        <Text dimColor>collapsed</Text>
      ) : (
        <Text>{item.content}</Text>
      )}
    </Box>
  );
};
