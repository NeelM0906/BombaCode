import { parseSource, isTreeSitterAvailable, detectLanguage } from "./tree-sitter.js";
import { logger } from "../utils/logger.js";

// ─── Types ───

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "method" | "variable" | "interface" | "type" | "import";
  line: number;
  endLine: number;
  filePath: string;
}

export interface FileSymbols {
  filePath: string;
  definitions: SymbolInfo[];
  references: string[]; // Symbol names referenced (imported/used) from other files
}

// ─── Tree-sitter Node Interface ───

// Minimal interface to work with tree-sitter nodes without importing native types
interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child(index: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
  children: TSNode[];
  descendantsOfType(type: string | string[]): TSNode[];
}

// ─── Main Extraction ───

/**
 * Extract symbols from a source file using tree-sitter when available,
 * falling back to regex-based extraction.
 */
export function extractSymbols(filePath: string, source: string): FileSymbols {
  const language = detectLanguage(filePath);
  if (!language) {
    return { filePath, definitions: [], references: [] };
  }

  if (isTreeSitterAvailable()) {
    try {
      return extractWithTreeSitter(filePath, source, language);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`tree-sitter extraction failed for ${filePath}, falling back to regex`, { error: message });
    }
  }

  return extractWithRegex(filePath, source);
}

// ─── Tree-sitter Extraction ───

function extractWithTreeSitter(filePath: string, source: string, language: string): FileSymbols {
  const parsed = parseSource(filePath, source);
  if (!parsed) {
    return extractWithRegex(filePath, source);
  }

  const rootNode = parsed.rootNode as TSNode;
  const definitions: SymbolInfo[] = [];
  const references: string[] = [];

  if (language === "python") {
    extractPythonSymbols(rootNode, filePath, definitions, references);
  } else {
    // TypeScript, TSX, JavaScript, JSX
    extractTSSymbols(rootNode, filePath, definitions, references);
  }

  return { filePath, definitions, references };
}

// ─── TypeScript / JavaScript Extraction ───

function extractTSSymbols(
  rootNode: TSNode,
  filePath: string,
  definitions: SymbolInfo[],
  references: string[],
): void {
  for (const child of rootNode.children) {
    switch (child.type) {
      case "function_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "function",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "class_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "class",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
          // Extract methods from class body
          extractClassMethods(child, filePath, name.text, definitions);
        }
        break;
      }

      case "interface_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "interface",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "type_alias_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "type",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "lexical_declaration": {
        // Extract variable declarators (const/let/var)
        extractVariableDeclarators(child, filePath, definitions);
        break;
      }

      case "export_statement": {
        // Unwrap export to get the actual declaration
        extractExportedSymbol(child, filePath, definitions, references);
        break;
      }

      case "import_statement": {
        extractTSImportReferences(child, references);
        break;
      }
    }
  }
}

function extractClassMethods(
  classNode: TSNode,
  filePath: string,
  className: string,
  definitions: SymbolInfo[],
): void {
  // Find class_body child
  for (const child of classNode.children) {
    if (child.type === "class_body") {
      for (const member of child.children) {
        if (member.type === "method_definition") {
          const name = member.childForFieldName("name");
          if (name && name.text !== "constructor") {
            definitions.push({
              name: `${className}.${name.text}`,
              kind: "method",
              line: member.startPosition.row + 1,
              endLine: member.endPosition.row + 1,
              filePath,
            });
          }
        }
      }
      break;
    }
  }
}

function extractVariableDeclarators(
  declNode: TSNode,
  filePath: string,
  definitions: SymbolInfo[],
): void {
  for (const child of declNode.children) {
    if (child.type === "variable_declarator") {
      const name = child.childForFieldName("name");
      if (name) {
        definitions.push({
          name: name.text,
          kind: "variable",
          line: declNode.startPosition.row + 1,
          endLine: declNode.endPosition.row + 1,
          filePath,
        });
      }
    }
  }
}

function extractExportedSymbol(
  exportNode: TSNode,
  filePath: string,
  definitions: SymbolInfo[],
  references: string[],
): void {
  for (const child of exportNode.children) {
    switch (child.type) {
      case "function_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "function",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "class_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "class",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
          extractClassMethods(child, filePath, name.text, definitions);
        }
        break;
      }

      case "interface_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "interface",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "type_alias_declaration": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "type",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "lexical_declaration": {
        extractVariableDeclarators(child, filePath, definitions);
        break;
      }
    }
  }
}

function extractTSImportReferences(importNode: TSNode, references: string[]): void {
  // Find the import source string (e.g., './bar' from `import { Foo } from './bar'`)
  const sourceNode = importNode.descendantsOfType("string_fragment");
  if (sourceNode.length > 0 && sourceNode[0]) {
    const importPath = sourceNode[0].text;
    // Only track relative imports (project-internal references)
    if (importPath.startsWith(".")) {
      references.push(importPath);
    }
  }
}

// ─── Python Extraction ───

function extractPythonSymbols(
  rootNode: TSNode,
  filePath: string,
  definitions: SymbolInfo[],
  references: string[],
): void {
  for (const child of rootNode.children) {
    switch (child.type) {
      case "function_definition": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "function",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
        break;
      }

      case "class_definition": {
        const name = child.childForFieldName("name");
        if (name) {
          definitions.push({
            name: name.text,
            kind: "class",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
          extractPythonClassMethods(child, filePath, name.text, definitions);
        }
        break;
      }

      case "decorated_definition": {
        // Handle @decorator-prefixed classes and functions
        extractDecoratedDefinition(child, filePath, definitions);
        break;
      }

      case "import_statement": {
        // `import os` — not a relative import, skip for references
        break;
      }

      case "import_from_statement": {
        extractPythonImportReferences(child, references);
        break;
      }

      case "expression_statement": {
        // Top-level assignments like MY_CONSTANT = 42
        extractPythonTopLevelAssignment(child, filePath, definitions);
        break;
      }
    }
  }
}

function extractPythonClassMethods(
  classNode: TSNode,
  filePath: string,
  className: string,
  definitions: SymbolInfo[],
): void {
  // Find `block` child of class
  for (const child of classNode.children) {
    if (child.type === "block") {
      for (const member of child.children) {
        if (member.type === "function_definition") {
          const name = member.childForFieldName("name");
          if (name && name.text !== "__init__") {
            definitions.push({
              name: `${className}.${name.text}`,
              kind: "method",
              line: member.startPosition.row + 1,
              endLine: member.endPosition.row + 1,
              filePath,
            });
          }
        } else if (member.type === "decorated_definition") {
          // Handle decorated methods
          for (const sub of member.children) {
            if (sub.type === "function_definition") {
              const name = sub.childForFieldName("name");
              if (name && name.text !== "__init__") {
                definitions.push({
                  name: `${className}.${name.text}`,
                  kind: "method",
                  line: sub.startPosition.row + 1,
                  endLine: sub.endPosition.row + 1,
                  filePath,
                });
              }
            }
          }
        }
      }
      break;
    }
  }
}

function extractDecoratedDefinition(
  decoratedNode: TSNode,
  filePath: string,
  definitions: SymbolInfo[],
): void {
  for (const child of decoratedNode.children) {
    if (child.type === "function_definition") {
      const name = child.childForFieldName("name");
      if (name) {
        definitions.push({
          name: name.text,
          kind: "function",
          line: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          filePath,
        });
      }
    } else if (child.type === "class_definition") {
      const name = child.childForFieldName("name");
      if (name) {
        definitions.push({
          name: name.text,
          kind: "class",
          line: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          filePath,
        });
        extractPythonClassMethods(child, filePath, name.text, definitions);
      }
    }
  }
}

function extractPythonImportReferences(importNode: TSNode, references: string[]): void {
  // from <module> import <names>
  // Look for the module name (dotted_name after "from")
  let foundFrom = false;
  for (const child of importNode.children) {
    if (child.type === "from") {
      foundFrom = true;
      continue;
    }
    if (foundFrom && child.type === "dotted_name") {
      const moduleName = child.text;
      // Only track relative imports
      if (moduleName.startsWith(".")) {
        references.push(moduleName);
      }
      break;
    }
    if (foundFrom && child.type === "relative_import") {
      references.push(child.text);
      break;
    }
  }
}

function extractPythonTopLevelAssignment(
  exprNode: TSNode,
  filePath: string,
  definitions: SymbolInfo[],
): void {
  for (const child of exprNode.children) {
    if (child.type === "assignment") {
      // Get left side of assignment
      const left = child.child(0);
      if (left && left.type === "identifier") {
        // Convention: UPPER_CASE names are constants/important module-level variables
        const name = left.text;
        if (name === name.toUpperCase() && name.length > 1) {
          definitions.push({
            name,
            kind: "variable",
            line: child.startPosition.row + 1,
            endLine: child.endPosition.row + 1,
            filePath,
          });
        }
      }
    }
  }
}

// ─── Regex Fallback ───

function extractWithRegex(filePath: string, source: string): FileSymbols {
  const lines = source.split("\n");
  const definitions: SymbolInfo[] = [];
  const references: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Functions
    const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (fnMatch?.[1]) {
      definitions.push({ name: fnMatch[1], kind: "function", line: lineNum, endLine: lineNum, filePath });
    }

    // Classes
    const classMatch = line.match(/(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (classMatch?.[1]) {
      definitions.push({ name: classMatch[1], kind: "class", line: lineNum, endLine: lineNum, filePath });
    }

    // Interfaces (TypeScript)
    const ifaceMatch = line.match(/(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (ifaceMatch?.[1]) {
      definitions.push({ name: ifaceMatch[1], kind: "interface", line: lineNum, endLine: lineNum, filePath });
    }

    // Type aliases (TypeScript)
    const typeMatch = line.match(/(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/);
    if (typeMatch?.[1]) {
      definitions.push({ name: typeMatch[1], kind: "type", line: lineNum, endLine: lineNum, filePath });
    }

    // Imports (references)
    const importMatch = line.match(/import\s+.*?from\s+['"](\.[^'"]+)['"]/);
    if (importMatch?.[1]) {
      references.push(importMatch[1]);
    }

    // Python def
    const pyFnMatch = line.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (pyFnMatch?.[1]) {
      definitions.push({ name: pyFnMatch[1], kind: "function", line: lineNum, endLine: lineNum, filePath });
    }

    // Python from ... import
    const pyImportMatch = line.match(/from\s+(\.[^\s]+)\s+import/);
    if (pyImportMatch?.[1]) {
      references.push(pyImportMatch[1]);
    }
  }

  return { filePath, definitions, references };
}
