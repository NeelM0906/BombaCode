import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SlashCommandRegistry } from "../command-registry.js";
import type { SlashCommandDefinition } from "../command-registry.js";
import { useMultiLineInput } from "../hooks/useMultiLineInput.js";
import { SlashCommandMenu } from "./SlashCommandMenu.js";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onSlashCommand?: (input: string) => void;
  commandRegistry?: SlashCommandRegistry;
  loading?: boolean;
  isFocused?: boolean;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const InputBar: React.FC<InputBarProps> = ({
  onSubmit,
  onSlashCommand,
  commandRegistry,
  loading = false,
  isFocused = true,
}) => {
  const [inputState, inputActions] = useMultiLineInput();
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommandDefinition[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const lastPrefixRef = useRef("");

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timer = setInterval(() => {
      setSpinnerIdx((index) => (index + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!commandRegistry) {
      setMenuOpen(false);
      setFilteredCommands([]);
      setSelectedIndex(0);
      lastPrefixRef.current = "";
      return;
    }

    if (inputState.isMultiLine) {
      setMenuOpen(false);
      setFilteredCommands([]);
      setSelectedIndex(0);
      lastPrefixRef.current = "";
      return;
    }

    const match = inputState.value.match(/^\/(\S*)$/);
    if (!match) {
      setMenuOpen(false);
      setFilteredCommands([]);
      setSelectedIndex(0);
      lastPrefixRef.current = "";
      return;
    }

    const prefix = match[1] ?? "";
    const matches = commandRegistry.filterByPrefix(prefix);
    if (matches.length === 0) {
      setMenuOpen(false);
      setFilteredCommands([]);
      setSelectedIndex(0);
      lastPrefixRef.current = "";
      return;
    }

    setMenuOpen(true);
    setFilteredCommands(matches);
    setSelectedIndex((previous) => {
      if (prefix !== lastPrefixRef.current) {
        return 0;
      }
      return Math.min(previous, matches.length - 1);
    });

    lastPrefixRef.current = prefix;
  }, [commandRegistry, inputState.isMultiLine, inputState.value]);

  const closeMenu = (): void => {
    setMenuOpen(false);
    setFilteredCommands([]);
    setSelectedIndex(0);
    lastPrefixRef.current = "";
  };

  const executeSelectedCommand = (command: SlashCommandDefinition): void => {
    closeMenu();

    if (command.argHint) {
      inputActions.setValue(`/${command.name} `);
      return;
    }

    inputActions.clear();
    if (onSlashCommand) {
      onSlashCommand(`/${command.name}`);
      return;
    }

    onSubmit(`/${command.name}`);
  };

  useInput(
    (inputChar, key) => {
      const isNewLineShortcut = (key.return && key.shift) || (key.ctrl && inputChar === "j");

      if (menuOpen) {
        if (key.escape) {
          closeMenu();
          return;
        }

        if (key.upArrow) {
          setSelectedIndex((current) =>
            filteredCommands.length === 0 ? 0 : (current - 1 + filteredCommands.length) % filteredCommands.length
          );
          return;
        }

        if (key.downArrow) {
          setSelectedIndex((current) =>
            filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length
          );
          return;
        }

        if (key.tab) {
          const selectedCommand = filteredCommands[selectedIndex];
          if (!selectedCommand) {
            return;
          }

          const base = `/${selectedCommand.name}`;
          inputActions.setValue(selectedCommand.argHint ? `${base} ` : base);
          closeMenu();
          return;
        }

        if (isNewLineShortcut) {
          inputActions.insertNewline();
          closeMenu();
          return;
        }

        if (key.return) {
          const selectedCommand = filteredCommands[selectedIndex];
          if (!selectedCommand) {
            return;
          }

          executeSelectedCommand(selectedCommand);
          return;
        }
      }

      if (isNewLineShortcut) {
        inputActions.insertNewline();
        return;
      }

      if (key.return) {
        const submitted = inputActions.submitAndClear();
        closeMenu();
        if (submitted) {
          onSubmit(submitted);
        }
        return;
      }

      if (key.escape) {
        inputActions.clear();
        return;
      }

      if (key.backspace || key.delete) {
        inputActions.deleteBack();
        return;
      }

      if (key.ctrl && inputChar === "u") {
        inputActions.clearLine();
        return;
      }

      if (key.ctrl && inputChar === "w") {
        inputActions.deleteWord();
        return;
      }

      if (inputChar && !key.ctrl && !key.meta) {
        inputActions.insertChar(inputChar);
      }
    },
    { isActive: !loading && isFocused }
  );

  if (loading) {
    return (
      <Box paddingX={1}>
        <Text color="yellow">
          {SPINNER_FRAMES[spinnerIdx]} thinking...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {menuOpen ? <SlashCommandMenu commands={filteredCommands} selectedIndex={selectedIndex} /> : null}
      {inputState.lines.map((line, index) => (
        <Text key={index}>
          <Text color="green" bold={index === 0}>
            {index === 0 ? "> " : "  "}
          </Text>
          <Text>{line}</Text>
          {index === inputState.lines.length - 1 ? <Text color="gray">█</Text> : null}
        </Text>
      ))}
    </Box>
  );
};
