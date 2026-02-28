import React from "react";
import { Text } from "ink";
import Spinner from "ink-spinner";

interface SpinnerProps {
  label?: string;
}

export const BusySpinner: React.FC<SpinnerProps> = ({ label = "Working..." }) => {
  return (
    <Text color="yellow">
      <Spinner type="dots" /> {label}
    </Text>
  );
};
