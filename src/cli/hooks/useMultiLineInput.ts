import { useMemo, useRef, useState } from "react";

export interface MultiLineInputState {
  value: string;
  lines: string[];
  isMultiLine: boolean;
}

export interface MultiLineInputActions {
  insertChar(char: string): void;
  insertNewline(): void;
  deleteBack(): void;
  clear(): void;
  clearLine(): void;
  deleteWord(): void;
  setValue(val: string): void;
  submitAndClear(): string;
}

export function useMultiLineInput(): [MultiLineInputState, MultiLineInputActions] {
  const [value, setValue] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const state = useMemo<MultiLineInputState>(() => {
    const lines = value.length > 0 ? value.split("\n") : [""];
    return {
      value,
      lines,
      isMultiLine: lines.length > 1,
    };
  }, [value]);

  const actions = useMemo<MultiLineInputActions>(() => ({
    insertChar(char: string): void {
      setValue((previous) => previous + char);
    },

    insertNewline(): void {
      setValue((previous) => previous + "\n");
    },

    deleteBack(): void {
      setValue((previous) => previous.slice(0, -1));
    },

    clear(): void {
      setValue("");
    },

    clearLine(): void {
      setValue((previous) => {
        const lastNewline = previous.lastIndexOf("\n");
        if (lastNewline === -1) {
          return "";
        }
        return previous.slice(0, lastNewline + 1);
      });
    },

    deleteWord(): void {
      setValue((previous) => {
        const withoutTrailingSpaces = previous.replace(/\s+$/, "");
        return withoutTrailingSpaces.replace(/\S+$/, "");
      });
    },

    setValue(nextValue: string): void {
      setValue(nextValue);
    },

    submitAndClear(): string {
      const trimmed = valueRef.current.trim();
      setValue("");
      return trimmed;
    },
  }), []);

  return [state, actions];
}
