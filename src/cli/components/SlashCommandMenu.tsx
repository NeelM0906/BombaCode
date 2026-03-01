import React from "react";
import { Box, Text } from "ink";
import type { SlashCommandDefinition } from "../command-registry.js";

export interface SlashCommandMenuProps {
  commands: SlashCommandDefinition[];
  selectedIndex: number;
  maxVisible?: number;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  commands,
  selectedIndex,
  maxVisible = 6,
}) => {
  if (commands.length === 0) {
    return null;
  }

  const visibleCount = Math.max(1, maxVisible);
  const boundedSelectedIndex = Math.max(0, Math.min(selectedIndex, commands.length - 1));
  const windowStart = Math.max(0, boundedSelectedIndex - visibleCount + 1);
  const windowEnd = Math.min(commands.length, windowStart + visibleCount);
  const visibleCommands = commands.slice(windowStart, windowEnd);

  return (
    <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
      {visibleCommands.map((command, index) => {
        const absoluteIndex = windowStart + index;
        const isSelected = absoluteIndex === boundedSelectedIndex;

        return (
          <Box key={command.name} marginRight={1}>
            {isSelected ? (
              <Text inverse>{`> /${command.name}${command.argHint ? ` ${command.argHint}` : ""}  ${command.description}`}</Text>
            ) : (
              <Text>
                {`  /${command.name}`}
                {command.argHint ? <Text color="yellow" dimColor>{` ${command.argHint}`}</Text> : null}
                {`  ${command.description}`}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
