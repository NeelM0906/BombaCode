import { describe, expect, it } from "vitest";
import { detectLanguage, parseSource, isTreeSitterAvailable, getSupportedExtensions } from "../../src/codebase/tree-sitter.js";

describe("tree-sitter", () => {
  describe("detectLanguage", () => {
    it("detects TypeScript from .ts extension", () => {
      expect(detectLanguage("src/index.ts")).toBe("typescript");
    });

    it("detects TSX from .tsx extension", () => {
      expect(detectLanguage("src/App.tsx")).toBe("tsx");
    });

    it("detects JavaScript from .js extension", () => {
      expect(detectLanguage("lib/util.js")).toBe("javascript");
    });

    it("detects JavaScript from .jsx extension", () => {
      expect(detectLanguage("src/Component.jsx")).toBe("javascript");
    });

    it("detects Python from .py extension", () => {
      expect(detectLanguage("app/main.py")).toBe("python");
    });

    it("returns null for unsupported extensions", () => {
      expect(detectLanguage("style.css")).toBeNull();
      expect(detectLanguage("README.md")).toBeNull();
      expect(detectLanguage("data.json")).toBeNull();
      expect(detectLanguage("Makefile")).toBeNull();
    });

    it("handles case-insensitive extensions", () => {
      // detectLanguage normalizes extensions to lowercase for robustness
      expect(detectLanguage("file.TS")).toBe("typescript");
      expect(detectLanguage("file.PY")).toBe("python");
    });
  });

  describe("getSupportedExtensions", () => {
    it("returns all supported extensions", () => {
      const exts = getSupportedExtensions();
      expect(exts).toContain(".ts");
      expect(exts).toContain(".tsx");
      expect(exts).toContain(".js");
      expect(exts).toContain(".jsx");
      expect(exts).toContain(".py");
      expect(exts.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("isTreeSitterAvailable", () => {
    it("returns true when native bindings are present", () => {
      expect(isTreeSitterAvailable()).toBe(true);
    });
  });

  describe("parseSource", () => {
    it("parses TypeScript source and returns a valid tree", () => {
      const source = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Greeter {
  private name: string;
  constructor(name: string) {
    this.name = name;
  }
}
`;
      const result = parseSource("test.ts", source);
      expect(result).not.toBeNull();
      expect(result!.language).toBe("typescript");
      expect(result!.tree).toBeDefined();
      expect(result!.rootNode).toBeDefined();
    });

    it("parses JavaScript source", () => {
      const source = `
function add(a, b) {
  return a + b;
}

module.exports = { add };
`;
      const result = parseSource("util.js", source);
      expect(result).not.toBeNull();
      expect(result!.language).toBe("javascript");
    });

    it("parses Python source", () => {
      const source = `
def greet(name):
    return f"Hello, {name}!"

class Greeter:
    def __init__(self, name):
        self.name = name
`;
      const result = parseSource("app.py", source);
      expect(result).not.toBeNull();
      expect(result!.language).toBe("python");
    });

    it("parses TSX source", () => {
      const source = `
import React from "react";

export function App(): JSX.Element {
  return <div>Hello</div>;
}
`;
      const result = parseSource("App.tsx", source);
      expect(result).not.toBeNull();
      expect(result!.language).toBe("tsx");
    });

    it("returns null for unsupported file types", () => {
      const result = parseSource("style.css", "body { color: red; }");
      expect(result).toBeNull();
    });

    it("handles empty source", () => {
      const result = parseSource("empty.ts", "");
      expect(result).not.toBeNull();
      expect(result!.language).toBe("typescript");
    });

    it("handles malformed source without throwing", () => {
      const source = `
function {{{ invalid syntax
  this is not valid TypeScript at all )))
`;
      // tree-sitter should parse it with errors but not throw
      const result = parseSource("broken.ts", source);
      expect(result).not.toBeNull();
    });
  });
});
