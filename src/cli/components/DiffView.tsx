import React from "react";
import { Box, Text } from "ink";

interface DiffViewProps {
  title: string;
  diffText: string;
}

export const DiffView: React.FC<DiffViewProps> = ({ title, diffText }) => {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        {title}
      </Text>
      <Text>{diffText}</Text>
    </Box>
  );
};
