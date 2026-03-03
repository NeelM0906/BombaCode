import { describe, expect, it } from "vitest";
import { extractSymbols } from "../../src/codebase/symbol-extractor.js";
import type { FileSymbols, SymbolInfo } from "../../src/codebase/symbol-extractor.js";

function findDef(symbols: FileSymbols, name: string): SymbolInfo | undefined {
  return symbols.definitions.find((d) => d.name === name);
}

describe("symbol-extractor", () => {
  describe("TypeScript extraction", () => {
    it("extracts function declarations", () => {
      const source = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

function helper(): void {}
`;
      const result = extractSymbols("test.ts", source);
      expect(findDef(result, "greet")).toBeDefined();
      expect(findDef(result, "greet")!.kind).toBe("function");
      expect(findDef(result, "helper")).toBeDefined();
      expect(findDef(result, "helper")!.kind).toBe("function");
    });

    it("extracts class declarations with methods", () => {
      const source = `
export class MyService {
  private value: number;

  constructor(val: number) {
    this.value = val;
  }

  getValue(): number {
    return this.value;
  }

  setValue(val: number): void {
    this.value = val;
  }
}
`;
      const result = extractSymbols("service.ts", source);
      expect(findDef(result, "MyService")).toBeDefined();
      expect(findDef(result, "MyService")!.kind).toBe("class");
      expect(findDef(result, "MyService.getValue")).toBeDefined();
      expect(findDef(result, "MyService.getValue")!.kind).toBe("method");
      expect(findDef(result, "MyService.setValue")).toBeDefined();
    });

    it("extracts interface declarations", () => {
      const source = `
export interface UserConfig {
  name: string;
  email: string;
}

interface InternalConfig {
  debug: boolean;
}
`;
      const result = extractSymbols("config.ts", source);
      expect(findDef(result, "UserConfig")).toBeDefined();
      expect(findDef(result, "UserConfig")!.kind).toBe("interface");
      expect(findDef(result, "InternalConfig")).toBeDefined();
    });

    it("extracts type alias declarations", () => {
      const source = `
export type Status = "active" | "inactive";
type InternalId = string | number;
`;
      const result = extractSymbols("types.ts", source);
      expect(findDef(result, "Status")).toBeDefined();
      expect(findDef(result, "Status")!.kind).toBe("type");
      expect(findDef(result, "InternalId")).toBeDefined();
    });

    it("extracts variable declarations", () => {
      const source = `
export const DEFAULT_TIMEOUT = 5000;
const INTERNAL_LIMIT = 100;
`;
      const result = extractSymbols("constants.ts", source);
      expect(findDef(result, "DEFAULT_TIMEOUT")).toBeDefined();
      expect(findDef(result, "DEFAULT_TIMEOUT")!.kind).toBe("variable");
      expect(findDef(result, "INTERNAL_LIMIT")).toBeDefined();
    });

    it("extracts import references for relative paths", () => {
      const source = `
import { Logger } from "./logger";
import { Config } from "../config/settings";
import chalk from "chalk";
import { join } from "node:path";
`;
      const result = extractSymbols("app.ts", source);
      expect(result.references).toContain("./logger");
      expect(result.references).toContain("../config/settings");
      // Non-relative imports should not be included
      expect(result.references).not.toContain("chalk");
      expect(result.references).not.toContain("node:path");
    });

    it("handles a complex file with mixed symbols", () => {
      const source = `
import { EventEmitter } from "events";
import type { Config } from "./config";

export interface PluginOptions {
  name: string;
  version: string;
}

export type PluginFactory = (opts: PluginOptions) => Plugin;

export class Plugin extends EventEmitter {
  private name: string;

  constructor(opts: PluginOptions) {
    super();
    this.name = opts.name;
  }

  getName(): string {
    return this.name;
  }
}

export function createPlugin(opts: PluginOptions): Plugin {
  return new Plugin(opts);
}

export const PLUGIN_VERSION = "1.0.0";
`;
      const result = extractSymbols("plugin.ts", source);
      expect(result.definitions.length).toBeGreaterThanOrEqual(5);
      expect(findDef(result, "PluginOptions")!.kind).toBe("interface");
      expect(findDef(result, "PluginFactory")!.kind).toBe("type");
      expect(findDef(result, "Plugin")!.kind).toBe("class");
      expect(findDef(result, "Plugin.getName")!.kind).toBe("method");
      expect(findDef(result, "createPlugin")!.kind).toBe("function");
      expect(findDef(result, "PLUGIN_VERSION")!.kind).toBe("variable");
      expect(result.references).toContain("./config");
    });
  });

  describe("Python extraction", () => {
    it("extracts function definitions", () => {
      const source = `
def process_data(data):
    return data.strip()

def validate(input_data):
    if not input_data:
        raise ValueError("Empty input")
    return True
`;
      const result = extractSymbols("utils.py", source);
      expect(findDef(result, "process_data")).toBeDefined();
      expect(findDef(result, "process_data")!.kind).toBe("function");
      expect(findDef(result, "validate")).toBeDefined();
    });

    it("extracts class definitions with methods", () => {
      const source = `
class DataProcessor:
    def __init__(self, config):
        self.config = config

    def process(self, data):
        return data

    def validate(self, data):
        return True
`;
      const result = extractSymbols("processor.py", source);
      expect(findDef(result, "DataProcessor")).toBeDefined();
      expect(findDef(result, "DataProcessor")!.kind).toBe("class");
      expect(findDef(result, "DataProcessor.process")).toBeDefined();
      expect(findDef(result, "DataProcessor.process")!.kind).toBe("method");
      expect(findDef(result, "DataProcessor.validate")).toBeDefined();
    });

    it("extracts top-level constant assignments", () => {
      const source = `
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30
my_var = "not a constant"
`;
      const result = extractSymbols("config.py", source);
      expect(findDef(result, "MAX_RETRIES")).toBeDefined();
      expect(findDef(result, "MAX_RETRIES")!.kind).toBe("variable");
      expect(findDef(result, "DEFAULT_TIMEOUT")).toBeDefined();
      // Lowercase variables are not extracted as they're not considered "important"
      expect(findDef(result, "my_var")).toBeUndefined();
    });

    it("extracts relative import references", () => {
      const source = `
from .utils import process_data
from ..config import settings
import os
from pathlib import Path
`;
      const result = extractSymbols("main.py", source);
      // Relative imports should be captured
      expect(result.references.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty source file", () => {
      const result = extractSymbols("empty.ts", "");
      expect(result.definitions).toEqual([]);
      expect(result.references).toEqual([]);
      expect(result.filePath).toBe("empty.ts");
    });

    it("handles unsupported file types gracefully", () => {
      const result = extractSymbols("style.css", "body { color: red; }");
      expect(result.definitions).toEqual([]);
      expect(result.references).toEqual([]);
    });

    it("handles malformed source without throwing", () => {
      const source = `
export function { broken syntax
  this is not valid )))
`;
      // Should not throw — either tree-sitter parses with errors or regex fallback handles it
      expect(() => extractSymbols("broken.ts", source)).not.toThrow();
    });

    it("preserves file path in all symbol info", () => {
      const source = `
export function hello(): void {}
export class World {}
`;
      const result = extractSymbols("src/hello.ts", source);
      for (const def of result.definitions) {
        expect(def.filePath).toBe("src/hello.ts");
      }
    });

    it("provides accurate line numbers", () => {
      const source = `
export function first(): void {}

export function second(): void {}
`;
      const result = extractSymbols("lines.ts", source);
      const first = findDef(result, "first");
      const second = findDef(result, "second");
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      // The second function should be on a later line than the first
      expect(second!.line).toBeGreaterThan(first!.line);
    });
  });
});
