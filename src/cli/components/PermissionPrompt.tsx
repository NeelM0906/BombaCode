import React from "react";
import { Box, Text } from "ink";

interface PermissionPromptProps {
  action: string;
}

export const PermissionPrompt: React.FC<PermissionPromptProps> = ({ action }) => {
  return (
    <Box borderStyle="single" borderColor="red" paddingX={1}>
      <Text color="red">Permission required: {action}</Text>
    </Box>
  );
};
