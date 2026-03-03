import { createRequire } from "node:module";
import { extname } from "node:path";
import { logger } from "../utils/logger.js";

// tree-sitter and its grammars are native CJS modules — use createRequire in ESM
const require = createRequire(import.meta.url);

// ─── Lazy-loaded native modules ───

let Parser: typeof import("tree-sitter") | null = null;
let TypeScriptGrammar: { typescript: unknown; tsx: unknown } | null = null;
let JavaScriptGrammar: unknown | null = null;
let PythonGrammar: unknown | null = null;
let loadAttempted = false;
let loadError: string | null = null;

function ensureLoaded(): boolean {
  if (loadAttempted) return Parser !== null;
  loadAttempted = true;

  try {
    Parser = require("tree-sitter") as typeof import("tree-sitter");
    TypeScriptGrammar = require("tree-sitter-typescript") as { typescript: unknown; tsx: unknown };
    JavaScriptGrammar = require("tree-sitter-javascript") as unknown;
    PythonGrammar = require("tree-sitter-python") as unknown;
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    loadError = message;
    logger.warn("tree-sitter native bindings unavailable, falling back to regex extraction", { error: message });
    return false;
  }
}

// ─── Types ───

export interface ParseResult {
  language: string;
  tree: unknown; // Parser.Tree — kept as unknown to avoid type import issues with native module
  rootNode: unknown; // Parser.SyntaxNode
}

// Keep the legacy interface for backward compat
export interface ParsedTree {
  language: string;
  sourceLength: number;
}

// ─── Language Detection ───

const EXTENSION_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

export function detectLanguage(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Get the tree-sitter grammar for a given language identifier.
 */
function getGrammar(language: string): unknown | null {
  switch (language) {
    case "typescript":
      return TypeScriptGrammar?.typescript ?? null;
    case "tsx":
      return TypeScriptGrammar?.tsx ?? null;
    case "javascript":
      return JavaScriptGrammar;
    case "python":
      return PythonGrammar;
    default:
      return null;
  }
}

// ─── Parsing ───

/**
 * Parse source code with the appropriate tree-sitter grammar.
 * Returns null if the language is unsupported or tree-sitter is unavailable.
 */
export function parseSource(filePath: string, source: string): ParseResult | null {
  const language = detectLanguage(filePath);
  if (!language) return null;

  if (!ensureLoaded() || !Parser) return null;

  const grammar = getGrammar(language);
  if (!grammar) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (Parser as any)();
    parser.setLanguage(grammar);
    const tree = parser.parse(source);

    return {
      language,
      tree,
      rootNode: tree.rootNode,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to parse ${filePath}`, { error: message });
    return null;
  }
}

/**
 * Legacy stub-compatible API.
 */
export function parseWithTreeSitter(language: string, source: string): ParsedTree {
  return {
    language,
    sourceLength: source.length,
  };
}

/**
 * Check whether tree-sitter native bindings are available.
 */
export function isTreeSitterAvailable(): boolean {
  return ensureLoaded();
}

/**
 * Get the set of supported file extensions.
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}
