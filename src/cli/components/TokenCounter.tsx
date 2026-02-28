import React from "react";
import { Text } from "ink";

interface TokenCounterProps {
  tokens: number;
}

export const TokenCounterView: React.FC<TokenCounterProps> = ({ tokens }) => {
  return <Text dimColor>{tokens.toLocaleString()} tokens</Text>;
};
