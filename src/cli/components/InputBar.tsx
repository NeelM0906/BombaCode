import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface InputBarProps {
  onSubmit: (text: string) => void;
  loading?: boolean;
}

// Spinner frames for loading state
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const InputBar: React.FC<InputBarProps> = ({ onSubmit, loading = false }) => {
  const [input, setInput] = useState("");
  const [spinnerIdx, setSpinnerIdx] = useState(0);

  // Animate spinner
  React.useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, [loading]);

  useInput((inputChar, key) => {
    if (loading) return; // Don't accept input while loading

    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    // Ctrl+U: clear line
    if (key.ctrl && inputChar === "u") {
      setInput("");
      return;
    }

    // Ctrl+W: delete last word
    if (key.ctrl && inputChar === "w") {
      setInput((prev) => prev.replace(/\S+\s*$/, ""));
      return;
    }

    // Regular character input
    if (inputChar && !key.ctrl && !key.meta && inputChar.length === 1) {
      setInput((prev) => prev + inputChar);
    }
  });

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
    <Box paddingX={1}>
      <Text color="green" bold>{">"} </Text>
      <Text>{input}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
};
