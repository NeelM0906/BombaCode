import React from "react";
import { Text } from "ink";

interface CostTrackerProps {
  usd: number;
}

export const CostTrackerView: React.FC<CostTrackerProps> = ({ usd }) => {
  return <Text dimColor>${usd.toFixed(4)}</Text>;
};
