export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "variable";
  line: number;
}

export function extractSymbols(source: string): SymbolInfo[] {
  const lines = source.split("\n");
  const symbols: SymbolInfo[] = [];

  lines.forEach((line, index) => {
    const fnMatch = line.match(/function\s+([A-Za-z0-9_]+)/);
    if (fnMatch?.[1]) {
      symbols.push({ name: fnMatch[1], kind: "function", line: index + 1 });
    }

    const classMatch = line.match(/class\s+([A-Za-z0-9_]+)/);
    if (classMatch?.[1]) {
      symbols.push({ name: classMatch[1], kind: "class", line: index + 1 });
    }
  });

  return symbols;
}
