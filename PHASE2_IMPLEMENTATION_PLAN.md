# BombaCode Phase 2: Tool System & Agentic Loop
## End-to-End Development & Implementation Plan

**Goal:** Transform BombaCode from a conversational chatbot into a real coding agent that can read files, write code, execute commands, search codebases, and autonomously loop through multi-step tasks.

**Scope:** 8 core tools, tool infrastructure, permission system, agent loop upgrade, UI enhancements for tool output, and comprehensive testing.

**Estimated effort:** 28-35 hours of focused implementation

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Dependency Changes](#2-dependency-changes)
3. [Implementation Batches](#3-implementation-batches)
4. [Batch 1: Tool Infrastructure](#batch-1-tool-infrastructure-steps-1-5)
5. [Batch 2: File Operations Tools](#batch-2-file-operations-tools-steps-6-9)
6. [Batch 3: Search & Execution Tools](#batch-3-search--execution-tools-steps-10-13)
7. [Batch 4: Agent Loop Upgrade](#batch-4-agent-loop-upgrade-steps-14-17)
8. [Batch 5: Permission System](#batch-5-permission-system-steps-18-21)
9. [Batch 6: UI Enhancements](#batch-6-ui-enhancements-steps-22-25)
10. [Batch 7: System Prompt & Integration](#batch-7-system-prompt--integration-steps-26-29)
11. [Batch 8: Testing & Verification](#batch-8-testing--verification-steps-30-35)
12. [File Manifest](#file-manifest)
13. [Integration Points with Phase 1](#integration-points-with-phase-1)
14. [Verification Plan](#verification-plan)
15. [Risk Register](#risk-register)

---

## 1. Architecture Overview

### Phase 2 Component Map

```
src/
├── tools/                    ← NEW: All tool implementations
│   ├── base-tool.ts          ← Abstract tool interface + helpers
│   ├── read.ts               ← File reading with line numbers
│   ├── write.ts              ← File creation / overwrite
│   ├── edit.ts               ← String-match replacement (+ unified diff)
│   ├── bash.ts               ← Shell command execution
│   ├── glob.ts               ← File pattern matching
│   ├── grep.ts               ← Content search (ripgrep or native)
│   ├── todo.ts               ← Task tracking
│   └── ask-user.ts           ← Structured user input collection
│
├── core/
│   ├── agent-loop.ts         ← MODIFIED: Add tool use loop
│   ├── tool-registry.ts      ← NEW: Central tool registration
│   ├── tool-router.ts        ← NEW: Tool dispatch + parallel execution
│   ├── permission-manager.ts ← NEW: deny → ask → allow system
│   ├── checkpoint-manager.ts ← NEW: File snapshots for undo
│   ├── message-manager.ts    ← MODIFIED: Add tool result handling
│   └── system-prompt.ts      ← MODIFIED: Add tool descriptions + guidelines
│
├── cli/components/
│   ├── ToolOutput.tsx         ← NEW: Tool call/result rendering
│   ├── PermissionPrompt.tsx   ← NEW: Allow/deny/always-allow UI
│   ├── DiffView.tsx           ← NEW: Colored diff display
│   ├── MessageList.tsx        ← MODIFIED: Render tool calls inline
│   └── Header.tsx             ← MODIFIED: Show active tool indicator
│
├── security/                  ← NEW: Security layer
│   ├── path-validator.ts      ← Directory access control
│   └── command-filter.ts      ← Dangerous command blocking
│
├── llm/types.ts               ← MODIFIED: Add ToolResult type
├── memory/settings.ts         ← MODIFIED: Add permission settings
└── utils/
    └── diff.ts                ← NEW: Diff generation utilities
```

### Data Flow (Tool Use Cycle)

```
User Input
    ↓
AgentLoop.processUserInput(input)
    ↓
LLM API call (with tools[] in request)
    ↓
Stream response → render text deltas + tool call assembly
    ↓
stop_reason === "tool_use" ?
    ↓ YES
ToolRouter.executeToolCalls(toolCalls)
    ↓
For each tool call:
    PermissionManager.check(toolCall)
        → denied? → return "Permission denied" result
        → ask?    → render PermissionPrompt, await user response
        → allow?  → proceed
    ↓
    BaseTool.execute(input)
        → CheckpointManager.snapshot() (for write/edit)
        → Run tool logic
        → Truncate result if needed
        → Return ToolResult
    ↓
MessageManager.addAssistantMessage(content, toolCalls)
MessageManager.addToolResult(id, result) × N
    ↓
LOOP BACK to LLM API call (automatic, no user input needed)
    ↓
stop_reason === "end_turn" ?
    ↓ YES
Render final response, await next user input
```

---

## 2. Dependency Changes

### New Dependencies to Install

```bash
# Tool execution
npm i diff                    # Unified diff generation/parsing

# Already available (from Phase 1)
# globby                      # Glob pattern matching
# chalk                       # Terminal colors
```

### System Dependencies (Optional, Enhance Performance)

```
ripgrep (rg)    — Fast content search. Glob/grep tools use native fallback if unavailable.
```

### No New Dev Dependencies Needed

Phase 1 already has: `typescript`, `@types/node`, `tsx`, `vitest`

---

## 3. Implementation Batches

| Batch | Steps | Description | Est. Time |
|-------|-------|-------------|-----------|
| 1 | 1-5 | Tool infrastructure (base tool, registry, router, result types) | 3 hours |
| 2 | 6-9 | File operation tools (read, write, edit, diff utils) | 4 hours |
| 3 | 10-13 | Search & execution tools (glob, grep, bash, todo/ask-user) | 4 hours |
| 4 | 14-17 | Agent loop upgrade (tool use loop, streaming, result handling) | 5 hours |
| 5 | 18-21 | Permission system (manager, path validator, command filter, UI) | 4 hours |
| 6 | 22-25 | UI enhancements (tool output, diff view, message list upgrade) | 3 hours |
| 7 | 26-29 | System prompt, settings upgrade, checkpoint manager, integration | 3 hours |
| 8 | 30-35 | Testing & end-to-end verification | 4 hours |
| **Total** | **35** | | **~30 hours** |

---

## Batch 1: Tool Infrastructure (Steps 1-5)

### Step 1: Tool Result Type (`src/llm/types.ts` — MODIFY)

Add `ToolResult` interface alongside existing types:

```typescript
// Add to existing types.ts:

export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}
```

No other changes to types.ts — `ToolCall`, `ToolDefinition`, `StreamEvent` are already defined.

**Why this is first:** Every subsequent file depends on this type.

---

### Step 2: Base Tool Interface (`src/tools/base-tool.ts` — NEW)

Create the abstract tool contract that all tools implement:

```typescript
export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolExecuteResult {
  content: string;
  isError: boolean;
}

export interface Tool {
  // Identity
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;

  // Metadata for permission system
  category: "readonly" | "write" | "execute" | "interactive";

  // Execute the tool
  execute(input: ToolInput): Promise<ToolExecuteResult>;
}

// ─── Utility: Result truncation ───

const MAX_RESULT_TOKENS = 30000;  // ~120K chars
const MAX_LINE_LENGTH = 2000;

export function truncateResult(content: string, maxChars: number = MAX_RESULT_TOKENS * 4): string {
  if (content.length <= maxChars) return content;

  const headSize = Math.floor(maxChars * 0.4);
  const tailSize = Math.floor(maxChars * 0.4);
  const head = content.slice(0, headSize);
  const tail = content.slice(-tailSize);
  const skipped = content.length - headSize - tailSize;

  return `${head}\n\n... [${skipped} characters truncated] ...\n\n${tail}`;
}

export function truncateLines(content: string, maxLineLength: number = MAX_LINE_LENGTH): string {
  return content
    .split("\n")
    .map(line =>
      line.length > maxLineLength
        ? line.slice(0, maxLineLength) + "... [truncated]"
        : line
    )
    .join("\n");
}

export function formatLineNumbers(content: string, startLine: number = 1): string {
  const lines = content.split("\n");
  const maxWidth = String(startLine + lines.length - 1).length;
  return lines
    .map((line, i) => `${String(startLine + i).padStart(maxWidth)}\t${line}`)
    .join("\n");
}
```

**Design decisions:**
- `category` field powers permission defaults (readonly = auto-allow, write/execute = ask)
- `truncateResult` uses 40% head + 40% tail to preserve both start and end context (avoiding "lost in the middle" problem)
- `formatLineNumbers` matches Claude Code's `cat -n` style output format

---

### Step 3: Tool Registry (`src/core/tool-registry.ts` — NEW)

Central registry where all tools are registered at startup:

```typescript
import type { Tool } from "../tools/base-tool.js";
import type { ToolDefinition } from "../llm/types.js";

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Convert to LLM-compatible ToolDefinition array
  getToolDefinitions(): ToolDefinition[] {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}
```

**Why a registry:** Decouples tool discovery from execution. Phase 6 (MCP) will dynamically register MCP server tools at runtime alongside native tools.

---

### Step 4: Tool Router (`src/core/tool-router.ts` — NEW)

Dispatches tool calls to the appropriate tool and handles parallel execution:

```typescript
import type { ToolCall, ToolResult } from "../llm/types.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { PermissionManager, PermissionDecision } from "./permission-manager.js";
import type { CheckpointManager } from "./checkpoint-manager.js";
import { truncateResult, truncateLines } from "../tools/base-tool.js";
import { logger } from "../utils/logger.js";

export interface ToolRouterConfig {
  registry: ToolRegistry;
  permissionManager: PermissionManager;
  checkpointManager: CheckpointManager;
  onToolStart?: (toolCall: ToolCall) => void;
  onToolEnd?: (toolCall: ToolCall, result: ToolResult) => void;
  onPermissionRequest?: (toolCall: ToolCall) => Promise<PermissionDecision>;
}

export class ToolRouter {
  private config: ToolRouterConfig;

  constructor(config: ToolRouterConfig) {
    this.config = config;
  }

  async executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    // Execute tools sequentially (Phase 2 — parallel in Phase 3+)
    // Sequential is safer: write tools may depend on prior read tools
    for (const call of calls) {
      const result = await this.executeSingleTool(call);
      results.push(result);
    }

    return results;
  }

  private async executeSingleTool(call: ToolCall): Promise<ToolResult> {
    const tool = this.config.registry.getTool(call.name);

    if (!tool) {
      return {
        toolUseId: call.id,
        content: `Error: Unknown tool "${call.name}". Available tools: ${this.config.registry.getToolNames().join(", ")}`,
        isError: true,
      };
    }

    // Permission check
    const permission = await this.config.permissionManager.check(call, tool);

    if (permission === "denied") {
      return {
        toolUseId: call.id,
        content: `Permission denied for tool "${call.name}". The user blocked this action.`,
        isError: true,
      };
    }

    if (permission === "ask") {
      // Delegate to UI for user decision
      if (this.config.onPermissionRequest) {
        const decision = await this.config.onPermissionRequest(call);
        if (decision === "denied") {
          return {
            toolUseId: call.id,
            content: `Permission denied by user for tool "${call.name}".`,
            isError: true,
          };
        }
      }
    }

    // Notify UI that tool is starting
    this.config.onToolStart?.(call);

    try {
      // Create checkpoint for write operations
      if (tool.category === "write" || tool.category === "execute") {
        const filePath = call.input.file_path as string | undefined;
        if (filePath) {
          await this.config.checkpointManager.snapshot(filePath);
        }
      }

      // Execute the tool
      const result = await tool.execute(call.input);

      // Truncate large results
      let content = truncateLines(result.content);
      content = truncateResult(content);

      const toolResult: ToolResult = {
        toolUseId: call.id,
        content,
        isError: result.isError,
      };

      // Notify UI that tool is done
      this.config.onToolEnd?.(call, toolResult);

      logger.debug("Tool executed", {
        name: call.name,
        isError: result.isError,
        resultLength: content.length,
      });

      return toolResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Tool execution failed", { name: call.name, error: msg });

      const toolResult: ToolResult = {
        toolUseId: call.id,
        content: `Error executing tool "${call.name}": ${msg}`,
        isError: true,
      };

      this.config.onToolEnd?.(call, toolResult);
      return toolResult;
    }
  }
}
```

**Design decisions:**
- Sequential execution in Phase 2 for safety (write after read). Parallel comes in Phase 3.
- Permission check happens BEFORE execution, not during.
- Checkpoints created for `write` and `execute` category tools before they run.
- Results are always truncated through both line-level and total-length truncation.
- Errors are caught and returned as `isError: true` results — they never crash the agent loop.

---

### Step 5: Register All Tools (`src/tools/index.ts` — NEW)

Factory function that creates and registers all built-in tools:

```typescript
import { ToolRegistry } from "../core/tool-registry.js";
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { BashTool } from "./bash.js";
import { GlobTool } from "./glob.js";
import { GrepTool } from "./grep.js";
import { TodoTool } from "./todo.js";
import { AskUserTool } from "./ask-user.js";

export function registerBuiltinTools(
  registry: ToolRegistry,
  cwd: string
): void {
  registry.register(new ReadTool());
  registry.register(new WriteTool());
  registry.register(new EditTool());
  registry.register(new BashTool(cwd));
  registry.register(new GlobTool());
  registry.register(new GrepTool());
  registry.register(new TodoTool());
  registry.register(new AskUserTool());
}
```

**Note:** `BashTool` receives `cwd` because it maintains a working directory state across calls.

---

## Batch 2: File Operations Tools (Steps 6-9)

### Step 6: Read Tool (`src/tools/read.ts` — NEW)

Read file contents with line numbers. The most-used tool in any coding agent.

**Full implementation spec:**

```
Name: "read"
Category: "readonly"
Description: "Read the contents of a file at the given path. Returns line-numbered
  content. For large files, use offset and limit to read specific sections.
  Binary files return a size summary instead of content.
  Maximum 2000 lines per call unless limit is specified."

Input Schema:
  - file_path: string (required) — Absolute or relative path to the file
  - offset: number (optional) — Line number to start reading from (1-based)
  - limit: number (optional) — Maximum number of lines to return (default: 2000)

Output Format:
  Success: Line-numbered content (e.g., "  1\tconst x = 1;\n  2\tconst y = 2;")
  Error: "Error: File not found: /path/to/file.ts"
  Binary: "Binary file detected (24,576 bytes). Use a specific tool to process binary files."
```

**Implementation details:**
- Read file with `fs.readFile(path, "utf-8")`
- Detect binary files by checking for null bytes in the first 8KB
- Split into lines, apply offset/limit
- Format with right-aligned line numbers using `formatLineNumbers()`
- Truncate individual lines > 2000 chars
- Handle errors: ENOENT → "File not found", EACCES → "Permission denied", EISDIR → "Path is a directory, use glob instead"

---

### Step 7: Write Tool (`src/tools/write.ts` — NEW)

Create new files or overwrite existing files atomically.

```
Name: "write"
Category: "write"
Description: "Write content to a file. Creates the file and any parent directories
  if they don't exist. If the file already exists, it will be overwritten.
  Always prefer 'edit' over 'write' for modifying existing files."

Input Schema:
  - file_path: string (required) — Path to write to
  - content: string (required) — Full file content to write

Output Format:
  Success: "Successfully wrote 42 lines to /path/to/file.ts"
  Error: "Error: Cannot write to /path/to/file.ts: <reason>"
```

**Implementation details:**
- Create parent directories with `fs.mkdir(dir, { recursive: true })`
- Atomic write: write to `<file>.tmp.<random>`, then `fs.rename()` to final path
- Before overwrite, delegate to checkpoint manager for snapshot
- Return line count in success message
- Validate that content is not empty (warn but allow)
- Do NOT auto-add trailing newline (respect exactly what the LLM provides)

---

### Step 8: Edit Tool (`src/tools/edit.ts` — NEW)

The most critical tool. Supports string-match replacement (primary) with unified diff support.

```
Name: "edit"
Category: "write"
Description: "Make targeted edits to an existing file using exact string matching.
  Provide the exact text to find (old_string) and what to replace it with (new_string).

  IMPORTANT RULES:
  - old_string must match EXACTLY (including whitespace and indentation)
  - old_string must be unique in the file (fails if 0 or 2+ matches found)
  - For multiple changes to the same file, make separate edit calls
  - Always read a file before editing to see current content
  - Prefer edit over write for modifications to existing files

  Use replace_all: true to replace ALL occurrences (e.g., variable renames)."

Input Schema:
  - file_path: string (required) — Path to the file to edit
  - old_string: string (required) — Exact text to find in the file
  - new_string: string (required) — Replacement text
  - replace_all: boolean (optional, default false) — Replace all occurrences
```

**Implementation logic (detailed):**

```
1. Read file content (fs.readFile)
2. Count occurrences of old_string in content
3. If count === 0:
   → Return error: "String to replace not found in file. Make sure the text
     matches exactly, including whitespace and indentation."
4. If count >= 2 AND replace_all === false:
   → Return error: "Found {count} matches for the replacement text.
     Either provide more surrounding context to make it unique,
     or use replace_all: true to replace every occurrence."
5. If count === 1 OR replace_all === true:
   → newContent = content.replace(old_string, new_string)
     (use replaceAll for replace_all: true, replace for single)
   → Write newContent atomically
   → Return success: "Applied edit to {file_path}:
     - {old_lines} lines removed
     - {new_lines} lines added"
6. Generate a diff snippet for the UI (not returned to LLM, used for DiffView)
```

**Edge cases to handle:**
- Empty old_string → error
- old_string === new_string → error "old_string and new_string are identical"
- File doesn't exist → error "File not found"
- Very long old_string matching (> 100 lines) → warn but allow

---

### Step 9: Diff Utilities (`src/utils/diff.ts` — NEW)

Helper functions for generating and displaying diffs:

```
Functions:
  - generateDiff(oldContent, newContent, filePath): string
    → Creates a unified diff string using the 'diff' npm package
    → Used by DiffView component to show colored changes in the UI

  - countChanges(oldContent, newContent): { added: number, removed: number }
    → Counts lines added/removed for edit tool result messages

  - applyUnifiedDiff(content, diff): string | Error
    → Future: Apply a unified diff to file content (Phase 3)
    → Parses diff hunks, applies with exact line matching
    → Fuzzy matching (±3 lines) as fallback for line shifts
```

**Note:** Phase 2 only needs `generateDiff` and `countChanges`. The `applyUnifiedDiff` function is stubbed for Phase 3 when we add the `edit_diff` tool.

---

## Batch 3: Search & Execution Tools (Steps 10-13)

### Step 10: Glob Tool (`src/tools/glob.ts` — NEW)

Fast file pattern matching using the globby library (already installed in Phase 1).

```
Name: "glob"
Category: "readonly"
Description: "Find files matching a glob pattern. Returns file paths sorted by
  modification time (newest first). Respects .gitignore by default.

  Examples:
    '**/*.ts' — all TypeScript files
    'src/**/*.test.ts' — all test files in src/
    '*.{js,ts}' — JS and TS files in current directory"

Input Schema:
  - pattern: string (required) — Glob pattern to match
  - path: string (optional) — Directory to search in (default: cwd)

Output Format:
  Success: "Found 23 files:\n/path/to/file1.ts\n/path/to/file2.ts\n..."
  No matches: "No files found matching pattern '**/*.xyz'"
```

**Implementation details:**
- Use `globby(pattern, { cwd: path, gitignore: true, absolute: true })`
- Sort results by `fs.stat().mtime` (newest first)
- Limit to 1000 results to prevent token explosion
- If > 1000 results, append: "[Showing first 1000 of {total} matches. Narrow your pattern.]"

---

### Step 11: Grep Tool (`src/tools/grep.ts` — NEW)

Content search — tries ripgrep first, falls back to native Node.js implementation.

```
Name: "grep"
Category: "readonly"
Description: "Search file contents for a regex pattern. Uses ripgrep (rg) for speed
  when available, with a Node.js fallback.

  Output modes:
  - 'files_with_matches' (default): Returns only file paths that match
  - 'content': Returns matching lines with line numbers and optional context
  - 'count': Returns match counts per file

  Supports file type filtering via the 'glob' parameter."

Input Schema:
  - pattern: string (required) — Regex pattern to search for
  - path: string (optional) — Directory or file to search (default: cwd)
  - glob: string (optional) — File pattern filter (e.g., "*.ts")
  - output_mode: enum["files_with_matches", "content", "count"] (optional, default: "files_with_matches")
  - context: number (optional) — Lines of context around matches (for output_mode: "content")
  - case_insensitive: boolean (optional, default: false)

Output Format:
  files_with_matches: "Found matches in 5 files:\n/path/file1.ts\n/path/file2.ts"
  content: "/path/file.ts:42:  const result = await fetchData();\n/path/file.ts:43:  return result;"
  count: "/path/file1.ts: 3 matches\n/path/file2.ts: 1 match"
```

**Implementation strategy:**

```
1. Check if ripgrep is available: spawnSync("rg", ["--version"])
2. If ripgrep available:
   → Build rg command with flags:
     rg <pattern> <path>
       --glob <glob>            (if provided)
       --files-with-matches     (for files_with_matches mode)
       --count                  (for count mode)
       -n                       (line numbers, for content mode)
       -C <context>             (context lines)
       -i                       (case insensitive)
       --no-heading              (flat output)
       --hidden=false            (respect .gitignore)
   → Execute via child_process.spawnSync
   → Parse output
3. If ripgrep NOT available (native fallback):
   → Use globby to find files matching glob pattern
   → Read each file, test each line against new RegExp(pattern)
   → Build output in same format
   → Limit to first 100 files to prevent slowness
4. Truncate total output to MAX_RESULT_TOKENS
```

**Why ripgrep first:** 10-100x faster than native for large codebases. Respects .gitignore natively. But we must have a working fallback for systems without it installed.

---

### Step 12: Bash Tool (`src/tools/bash.ts` — NEW)

Execute shell commands with persistent working directory.

```
Name: "bash"
Category: "execute"
Description: "Execute a bash command in the shell. The working directory persists
  between calls (cd in one call affects the next).

  IMPORTANT:
  - Commands have a default timeout of 120 seconds (max 600 seconds)
  - Output is truncated at 30,000 characters
  - For long-running processes, consider running in background (&)
  - Avoid interactive commands (vim, less, etc.) — they will hang

  Examples of good usage:
  - 'npm test' — run tests
  - 'git status' — check git state
  - 'ls -la src/' — list directory
  - 'node script.js' — execute a script"

Input Schema:
  - command: string (required) — The bash command to execute
  - timeout: number (optional) — Timeout in milliseconds (default: 120000, max: 600000)

Output Format:
  Success: "Exit code: 0\n\nOutput:\n<stdout + stderr combined>"
  Timeout: "Error: Command timed out after 120 seconds"
  Error: "Exit code: 1\n\nOutput:\n<error output>"
```

**Implementation details (critical):**

```
State Management:
  - Maintain a `currentWorkingDirectory` string on the BashTool instance
  - Before each command, prepend: `cd "${cwd}" && `
  - After execution, if command contains 'cd ', update cwd by running
    a follow-up `pwd` command
  - Alternative (simpler): Use child_process.spawn with { cwd } option and
    parse "cd <dir>" commands to update internal state

Execution:
  - Use child_process.spawn("bash", ["-c", command], {
      cwd: this.currentWorkingDirectory,
      timeout: timeout,
      maxBuffer: 10 * 1024 * 1024,  // 10MB buffer
      env: { ...process.env, TERM: "dumb" },  // Prevent ANSI escapes
    })
  - Combine stdout and stderr into single output
  - Set TERM=dumb to avoid color codes that waste tokens
  - Handle timeout via the `timeout` spawn option

Truncation:
  - If combined output > 30,000 chars:
    → Keep first 14,000 chars + last 14,000 chars
    → Insert "[...truncated {N} characters...]" in the middle

Working Directory Updates:
  - After each command, run `pwd` in a follow-up spawn
  - Update this.currentWorkingDirectory with the result
  - This handles: cd, pushd, popd, and any command that changes directory
```

**Security concerns (delegated to command-filter.ts in Batch 5):**
- Never execute commands in the deny list without explicit permission
- Dangerous patterns: `rm -rf /`, `sudo rm`, `> /dev/sda`, `:(){ :|:& };:`, `mkfs`, `dd if=/dev/zero`, `chmod 777 /`

---

### Step 13: Todo & AskUser Tools (`src/tools/todo.ts`, `src/tools/ask-user.ts` — NEW)

Two lightweight interactive tools.

**Todo Tool:**
```
Name: "todo"
Category: "interactive"
Description: "Create and manage a task list to track progress on complex multi-step
  tasks. Show the user what you're working on and what's coming next."

Input Schema:
  - todos: array of { content: string, status: "pending"|"in_progress"|"completed" }

Output: "Updated todo list with {N} items ({completed} completed, {in_progress} in progress)"
```

**Implementation:** Stores the todo list in a class-level array. The UI (TodoList component, added in Batch 6) subscribes to changes via a callback.

**AskUser Tool:**
```
Name: "ask_user"
Category: "interactive"
Description: "Ask the user a question with predefined options. Use this to gather
  preferences, clarify requirements, or get decisions on implementation choices."

Input Schema:
  - question: string (required) — The question to ask
  - options: array of { label: string, description: string } (required, 2-4 options)

Output: The user's selected option label (e.g., "Option A")
```

**Implementation:** Emits a callback that the UI renders as a selection prompt. The tool `execute()` returns a Promise that resolves when the user makes a selection.

---

## Batch 4: Agent Loop Upgrade (Steps 14-17)

### Step 14: Upgrade Agent Loop for Tool Use (`src/core/agent-loop.ts` — MODIFY)

**This is the most critical change in Phase 2.** Transform the single-shot conversation into a proper agentic loop.

**Changes to `AgentLoop` class:**

```
New constructor dependencies:
  + toolRegistry: ToolRegistry
  + toolRouter: ToolRouter

New callbacks:
  + onToolCallStart?: (toolCall: ToolCall) => void
  + onToolCallEnd?: (toolCall: ToolCall, result: ToolResult) => void
  + onPermissionRequest?: (toolCall: ToolCall) => Promise<PermissionDecision>

Modified processUserInput(input):
  OLD: Single LLM call → return response
  NEW: Loop until stop_reason !== "tool_use"
```

**New processUserInput implementation (pseudocode):**

```
async processUserInput(input: string): Promise<string> {
  this._isProcessing = true;
  this._aborted = false;
  this.messageManager.addUserMessage(input);

  let fullTextResponse = "";

  // ─── AGENTIC LOOP ───
  while (true) {
    if (this._aborted) break;

    // 1. Build LLM request WITH tools
    const request = {
      model: this.model,
      systemPrompt: this.systemPrompt,
      messages: this.messageManager.getMessages(),
      tools: this.toolRegistry.getToolDefinitions(),  // ← NEW
      maxTokens: this.maxTokens,
    };

    // 2. Stream response (accumulate text + tool calls)
    let turnText = "";
    const toolCalls: ToolCall[] = [];

    for await (const event of this.provider.streamMessage(request)) {
      if (this._aborted) break;

      switch (event.type) {
        case "text_delta":
          turnText += event.content;
          this.onStreamDelta?.(event.content);
          break;

        case "tool_call_start":
          this.onToolCallStart?.(event.toolCall);
          break;

        case "tool_call_end":
          toolCalls.push(event.toolCall);
          break;

        case "usage":
          this.costTracker.recordUsage(this.model, event.usage);
          this.onUsageUpdate?.(event.usage);
          break;

        case "error":
          throw new Error(event.error);

        case "done":
          break;
      }
    }

    // 3. Add assistant message to history
    this.messageManager.addAssistantMessage(turnText, toolCalls.length > 0 ? toolCalls : undefined);
    fullTextResponse += turnText;

    // 4. If no tool calls → agent is done, break loop
    if (toolCalls.length === 0) {
      this.onStreamEnd?.(fullTextResponse);
      break;
    }

    // 5. Execute tool calls
    const results = await this.toolRouter.executeToolCalls(toolCalls);

    // 6. Add tool results to message history
    for (const result of results) {
      this.messageManager.addToolResult(result.toolUseId, result.content);
    }

    // 7. Clear streaming state for next turn
    this.onStreamEnd?.(turnText);  // Signal end of this turn's text
    fullTextResponse += "\n";       // Separator between turns

    // 8. Loop continues → sends messages + tool results back to LLM
  }

  this._isProcessing = false;
  return fullTextResponse;
}
```

**Key design points:**
- The `while(true)` loop continues as long as the LLM returns tool calls
- Each iteration: stream response → collect tool calls → execute tools → add results → loop
- Text and tool calls from the SAME response are collected together
- Tool results are added as separate messages (matching the ToolCall IDs)
- The loop exits when the LLM returns `end_turn` (no tool calls in response)
- Abort (Ctrl+C) can break at any point in the loop

---

### Step 15: Stream Event Assembly for Tool Calls

**Already handled by Phase 1 providers** — both `openrouter.ts` and `anthropic.ts` already emit `tool_call_start`, `tool_call_delta`, and `tool_call_end` events. The agent loop in Step 14 now consumes them.

**Verify in this step:**
- OpenRouter provider correctly accumulates partial function arguments across chunks
- Anthropic provider correctly handles `content_block_start` with `type: "tool_use"`
- Both providers emit `tool_call_end` with the fully parsed `ToolCall` object

If any issues found, fix the providers. This is a verification step, not a new file.

---

### Step 16: Tool Result Message Format

**Both providers need to correctly format tool results in the message array.**

For OpenRouter (OpenAI format), tool results must be:
```json
{ "role": "tool", "tool_call_id": "call_abc123", "content": "result text" }
```

For Anthropic format, tool results must be:
```json
{
  "role": "user",
  "content": [
    { "type": "tool_result", "tool_use_id": "toolu_abc123", "content": "result text" }
  ]
}
```

**Verify that `buildMessages()` in both providers handles the `tool` role message correctly.** The Anthropic provider already converts `tool` → `user` with `tool_result` blocks. The OpenRouter provider already maps `toolUseId` → `tool_call_id`. No new code needed if Phase 1 was correct.

---

### Step 17: Max Turns Safety Limit

Add a configurable maximum number of agent loop iterations to prevent infinite loops:

```
New AgentLoopConfig field:
  maxTurns: number (default: 25)

Implementation:
  - Track turnCount in the while loop
  - If turnCount >= maxTurns, break the loop
  - Add to final response: "\n\n[Reached maximum turns limit (25). Use /continue to resume.]"
  - Log a warning
```

**Why 25:** Matches typical Claude Code behavior. Most tasks complete in 5-15 turns. 25 provides generous headroom without risking runaway costs.

---

## Batch 5: Permission System (Steps 18-21)

### Step 18: Permission Manager (`src/core/permission-manager.ts` — NEW)

Three-tier permission evaluation: deny → ask → allow.

```typescript
export type PermissionDecision = "allowed" | "denied" | "ask";

export type PermissionMode = "normal" | "auto-edit" | "yolo" | "plan";

interface PermissionRule {
  type: "allow" | "deny" | "ask";
  tool?: string;           // Tool name or glob pattern
  pathPattern?: string;    // File path glob
  commandPattern?: string; // Bash command pattern
}

export class PermissionManager {
  private mode: PermissionMode;
  private rules: PermissionRule[];
  private sessionAllowList: Set<string>;  // Tools user has "always allowed" this session

  constructor(mode: PermissionMode, customRules?: PermissionRule[]) {
    this.mode = mode;
    this.sessionAllowList = new Set();
    this.rules = [
      // Default deny rules (highest priority)
      ...DEFAULT_DENY_RULES,
      // Custom rules from settings
      ...(customRules ?? []),
      // Default allow/ask rules
      ...DEFAULT_RULES,
    ];
  }

  async check(toolCall: ToolCall, tool: Tool): Promise<PermissionDecision> {
    // Yolo mode: allow everything
    if (this.mode === "yolo") return "allowed";

    // Plan mode: only readonly tools
    if (this.mode === "plan") {
      return tool.category === "readonly" ? "allowed" : "denied";
    }

    // Check session allow list
    if (this.sessionAllowList.has(toolCall.name)) return "allowed";

    // Evaluate rules (deny first, then allow, then ask)
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, toolCall, tool)) {
        if (rule.type === "deny") return "denied";
        if (rule.type === "allow") return "allowed";
        if (rule.type === "ask") return "ask";
      }
    }

    // Default by category
    switch (tool.category) {
      case "readonly": return "allowed";
      case "interactive": return "allowed";
      case "write": return this.mode === "auto-edit" ? "allowed" : "ask";
      case "execute": return "ask";
      default: return "ask";
    }
  }

  // User chose "always allow" for this session
  addSessionAllow(toolName: string): void {
    this.sessionAllowList.add(toolName);
  }

  private ruleMatches(rule: PermissionRule, call: ToolCall, tool: Tool): boolean {
    // Check tool name
    if (rule.tool && !this.globMatch(rule.tool, call.name)) return false;

    // Check file path pattern
    if (rule.pathPattern) {
      const filePath = call.input.file_path as string | undefined;
      if (!filePath || !this.globMatch(rule.pathPattern, filePath)) return false;
    }

    // Check command pattern
    if (rule.commandPattern) {
      const command = call.input.command as string | undefined;
      if (!command || !this.globMatch(rule.commandPattern, command)) return false;
    }

    return true;
  }

  private globMatch(pattern: string, value: string): boolean {
    // Simple glob matching: * matches anything
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return regex.test(value);
  }
}
```

**Default rules:**

```typescript
const DEFAULT_DENY_RULES: PermissionRule[] = [
  { type: "deny", tool: "bash", commandPattern: "*rm -rf /*" },
  { type: "deny", tool: "bash", commandPattern: "*sudo rm*" },
  { type: "deny", tool: "bash", commandPattern: "*> /dev/sda*" },
  { type: "deny", tool: "bash", commandPattern: "*:(){ :|:& };:*" },
  { type: "deny", tool: "bash", commandPattern: "*mkfs*" },
  { type: "deny", tool: "bash", commandPattern: "*dd if=/dev/zero*" },
  { type: "deny", tool: "bash", commandPattern: "*chmod 777 /*" },
];

const DEFAULT_RULES: PermissionRule[] = [
  { type: "allow", tool: "read" },
  { type: "allow", tool: "glob" },
  { type: "allow", tool: "grep" },
  { type: "allow", tool: "todo" },
  { type: "allow", tool: "ask_user" },
  { type: "ask", tool: "write" },
  { type: "ask", tool: "edit" },
  { type: "ask", tool: "bash" },
];
```

---

### Step 19: Path Validator (`src/security/path-validator.ts` — NEW)

Ensure tools can only access files within the project directory:

```
Functions:
  - isPathAllowed(filePath, projectRoot): boolean
    → Resolves to absolute path
    → Checks that resolved path starts with projectRoot
    → Blocks path traversal attacks (../../etc/passwd)
    → Allows symlinks only if they resolve within projectRoot

  - resolveToolPath(filePath, cwd, projectRoot): string
    → Resolves relative paths against cwd
    → Validates with isPathAllowed
    → Returns the resolved absolute path
    → Throws if path is outside projectRoot
```

**Integrated into:** Read, Write, Edit tools call `resolveToolPath()` before any file operations.

---

### Step 20: Command Filter (`src/security/command-filter.ts` — NEW)

Additional bash command safety layer beyond the deny rules:

```
Functions:
  - isDangerousCommand(command): { dangerous: boolean, reason?: string }
    → Check against blocklist patterns
    → Check for pipe to destructive commands
    → Check for environment variable manipulation of sensitive vars
    → Return explanation of why it's dangerous

  - sanitizeCommand(command): string
    → Strip ANSI escape sequences
    → Normalize whitespace
    → Used for consistent pattern matching

Dangerous patterns:
  - rm -rf / (or rm -rf ~)
  - sudo with destructive commands
  - Pipe to /dev/sda or similar
  - Fork bombs
  - Kernel module operations
  - Network tools sending data outbound (curl POST to unknown URLs)
```

**Integrated into:** Bash tool calls `isDangerousCommand()` before execution.

---

### Step 21: Permission Settings Extension (`src/memory/settings.ts` — MODIFY)

Add permission configuration to the settings schema:

```typescript
// Add to SettingsSchema:
permissions: z.object({
  mode: z.enum(["normal", "auto-edit", "yolo", "plan"]).default("normal"),
  customRules: z.array(z.object({
    type: z.enum(["allow", "deny", "ask"]),
    tool: z.string().optional(),
    pathPattern: z.string().optional(),
    commandPattern: z.string().optional(),
  })).default([]),
}).default({
  mode: "normal",
  customRules: [],
}),
```

---

## Batch 6: UI Enhancements (Steps 22-25)

### Step 22: ToolOutput Component (`src/cli/components/ToolOutput.tsx` — NEW)

Renders tool calls and results inline in the message stream:

```
Visual design:
  ┌─ read ─ /src/core/agent-loop.ts ──────────────────
  │ [dimmed result preview, collapsed by default]
  │ Read 158 lines (4,230 tokens)
  └────────────────────────────────────────────────────

  ┌─ edit ─ /src/core/agent-loop.ts ───────────────────
  │ Applied edit: 3 lines removed, 5 lines added
  │ [DiffView shown inline]
  └────────────────────────────────────────────────────

  ┌─ bash ─ npm test ──────────────────────────────────
  │ Exit code: 0
  │ [first 5 lines of output...]
  └────────────────────────────────────────────────────
```

**Props:**
```typescript
interface ToolOutputProps {
  toolCall: ToolCall;
  result?: ToolResult;
  isRunning: boolean;
}
```

**Rendering logic:**
- While running: show tool name + spinner
- After completion: show tool name + summary + optional collapsed output
- For `edit` tool: show DiffView component inline
- For `bash` tool: show exit code + first 5 lines
- For `read` tool: show "Read {N} lines" summary (don't repeat file content)
- Color code: green for success, red for error, yellow for running

---

### Step 23: PermissionPrompt Component (`src/cli/components/PermissionPrompt.tsx` — NEW)

Interactive permission prompt shown when a tool needs user approval:

```
Visual design:
  ┌─ Permission Required ──────────────────────────────
  │ BombaCode wants to: edit /src/core/agent-loop.ts
  │
  │ [y] Allow once  [a] Always allow  [n] Deny  [Esc] Abort
  └────────────────────────────────────────────────────

For bash:
  ┌─ Permission Required ──────────────────────────────
  │ BombaCode wants to run: npm install lodash
  │
  │ [y] Allow once  [a] Always allow  [n] Deny  [Esc] Abort
  └────────────────────────────────────────────────────
```

**Implementation:**
- Returns a Promise<PermissionDecision> that resolves when user presses a key
- `y` → "allowed" (once)
- `a` → "allowed" + add to session allow list
- `n` → "denied"
- `Esc` → "denied"
- Uses `useInput()` hook for keyboard handling
- Auto-timeout after 30 seconds → "denied"

---

### Step 24: DiffView Component (`src/cli/components/DiffView.tsx` — NEW)

Colored diff display for file edits:

```
Visual design:
  /src/core/agent-loop.ts
  @@ -45,3 +45,5 @@
    const request = {
  -   maxTokens: 4096,
  +   maxTokens: 8192,
  +   tools: this.toolRegistry.getToolDefinitions(),
    };
```

**Props:**
```typescript
interface DiffViewProps {
  filePath: string;
  diff: string;        // Unified diff string
  maxLines?: number;   // Collapse if > this many lines (default: 20)
}
```

**Rendering:**
- Green text (`color="green"`) for `+` lines (additions)
- Red text (`color="red"`) for `-` lines (deletions)
- Dim text for context lines
- File path as header
- Hunk headers (`@@`) in cyan
- Collapse long diffs with "[{N} more lines...]"

---

### Step 25: MessageList Upgrade (`src/cli/components/MessageList.tsx` — MODIFY)

Update MessageList to render tool calls inline within assistant messages:

**Changes:**
- When an assistant message has `toolCalls`, render each as a `<ToolOutput>` component
- When a `tool` message follows, match it to its ToolOutput and update with the result
- Tool outputs appear between the assistant's text and the next user message
- Streaming text still appears at the bottom as before

**New rendering flow:**
```
For each message in messages:
  if user → render user bubble
  if assistant →
    render text content (if any)
    if toolCalls → render ToolOutput for each (initially as "running")
  if tool →
    find the matching ToolOutput and update it with the result
```

---

## Batch 7: System Prompt & Integration (Steps 26-29)

### Step 26: System Prompt Upgrade (`src/core/system-prompt.ts` — MODIFY)

The system prompt must now include tool usage guidelines. This is critical for the LLM to use tools effectively.

**New structure:**

```
Section 1: CORE IDENTITY (~500 tokens)
  "You are BombaCode, a CLI coding agent..."
  "You have access to tools for file operations, search, and command execution."
  "You help developers write, debug, and understand code directly from their terminal."

Section 2: TOOL GUIDELINES (~2000 tokens)
  "CRITICAL RULES:
   - Always read a file before editing it.
   - Use edit for modifications, write for creating new files.
   - Use glob/grep to find files before reading them.
   - Check file existence before editing.
   - Use bash for running tests, git operations, and installing packages.
   - Never use bash for file operations (reading, writing) — use the dedicated tools.
   - When making multiple changes to a file, make separate edit calls.
   - After making code changes, run relevant tests to verify."

  Per-tool guidance:
   - read: "Use offset/limit for large files. Read before edit."
   - edit: "old_string must match exactly. Include enough context for uniqueness."
   - write: "Only for NEW files. Use edit for modifications."
   - bash: "Use for git, npm, test runners. Avoid interactive commands."
   - glob: "Use to discover files before reading. Pattern examples."
   - grep: "Use for searching code content. Regex patterns."

Section 3: ENVIRONMENT INFO (~200 tokens)
  - OS, shell, cwd, date
  - Available tools list
  - Current working directory

Section 4: RESPONSE FORMAT (~300 tokens)
  - Use markdown
  - Show code in fenced blocks
  - After tool use, summarize what was done
  - If uncertain, read the code first
```

**Total system prompt target: ~3000 tokens** (well within cache budget)

---

### Step 27: Checkpoint Manager (`src/core/checkpoint-manager.ts` — NEW)

File snapshots for undo capability:

```typescript
interface FileSnapshot {
  filePath: string;
  content: string | null;  // null = file didn't exist before
  timestamp: number;
}

export class CheckpointManager {
  private stack: FileSnapshot[] = [];
  private maxSnapshots = 50;

  async snapshot(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      this.stack.push({ filePath, content, timestamp: Date.now() });
    } catch {
      // File doesn't exist yet — record null so undo can delete it
      this.stack.push({ filePath, content: null, timestamp: Date.now() });
    }

    // Limit stack size
    if (this.stack.length > this.maxSnapshots) {
      this.stack = this.stack.slice(-this.maxSnapshots);
    }
  }

  async undo(): Promise<{ filePath: string; restored: boolean } | null> {
    const snapshot = this.stack.pop();
    if (!snapshot) return null;

    if (snapshot.content === null) {
      // File was newly created — delete it
      await fs.unlink(snapshot.filePath).catch(() => {});
      return { filePath: snapshot.filePath, restored: true };
    }

    await fs.writeFile(snapshot.filePath, snapshot.content, "utf-8");
    return { filePath: snapshot.filePath, restored: true };
  }

  getUndoCount(): number {
    return this.stack.length;
  }

  getLastSnapshot(): FileSnapshot | undefined {
    return this.stack[this.stack.length - 1];
  }

  clear(): void {
    this.stack = [];
  }
}
```

**Integration:** Write and Edit tools call `checkpointManager.snapshot(filePath)` before making changes. The `/undo` command and `Esc Esc` keyboard shortcut call `checkpointManager.undo()`.

---

### Step 28: App Integration (`src/cli/app.tsx` — MODIFY)

Wire all Phase 2 components into the main app:

**New initializations in useEffect:**
```
1. Create ToolRegistry
2. Create CheckpointManager
3. Create PermissionManager (from settings.permissions)
4. Create ToolRouter (with registry, permissionManager, checkpointManager)
5. Call registerBuiltinTools(registry, cwd)
6. Create AgentLoop with new dependencies (registry, toolRouter)
7. Wire callbacks:
   - onToolCallStart → update UI state (show tool running)
   - onToolCallEnd → update UI state (show result)
   - onPermissionRequest → render PermissionPrompt, await user choice
```

**New state:**
```typescript
const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCall>>(new Map());
const [toolResults, setToolResults] = useState<Map<string, ToolResult>>(new Map());
const [permissionRequest, setPermissionRequest] = useState<ToolCall | null>(null);
```

**New commands:**
```
/undo      — Call checkpointManager.undo(), show result
/tools     — List registered tools
/mode <m>  — Switch permission mode (normal/auto-edit/yolo/plan)
```

---

### Step 29: CLI Entry Update (`src/index.tsx` — MODIFY)

Add the `--mode` flag for permission modes:

```typescript
.option("--mode <mode>", "Permission mode: normal, auto-edit, yolo, plan")
```

Pass mode through to settings/app initialization.

---

## Batch 8: Testing & Verification (Steps 30-35)

### Step 30: Tool Unit Tests (`test/tools/` — NEW)

**test/tools/read.test.ts:**
- Reads a file and returns line-numbered content
- Handles offset and limit correctly
- Returns error for missing files
- Detects binary files
- Truncates long lines

**test/tools/write.test.ts:**
- Creates a new file with content
- Creates parent directories automatically
- Overwrites existing file
- Returns correct line count

**test/tools/edit.test.ts (MOST IMPORTANT):**
- Single match: applies replacement correctly
- Zero matches: returns descriptive error
- Multiple matches (replace_all: false): returns error with match count
- Multiple matches (replace_all: true): replaces all occurrences
- Preserves whitespace and indentation
- Handles multi-line old_string
- Empty old_string: returns error
- old_string === new_string: returns error

**test/tools/bash.test.ts:**
- Executes simple command and returns output
- Captures exit code
- Handles timeout
- Maintains working directory across calls (cd + pwd)
- Truncates large output
- Combines stdout and stderr

**test/tools/glob.test.ts:**
- Matches files with glob pattern
- Respects path parameter
- Returns sorted results
- Handles no matches gracefully
- Limits results to 1000

**test/tools/grep.test.ts:**
- Finds content matching regex
- Supports case-insensitive search
- Supports output modes (files, content, count)
- Returns context lines when requested
- Uses native fallback when ripgrep unavailable

---

### Step 31: Core Infrastructure Tests (`test/core/` — NEW)

**test/core/tool-registry.test.ts:**
- Registers and retrieves tools
- Generates ToolDefinition array for LLM
- Handles duplicate registration error
- Unregister removes tool

**test/core/tool-router.test.ts:**
- Executes tool call and returns result
- Handles unknown tool name
- Catches execution errors and returns isError result
- Calls permission manager before execution
- Creates checkpoint for write tools

**test/core/permission-manager.test.ts:**
- Auto-allows readonly tools
- Asks for write tools in normal mode
- Allows all tools in yolo mode
- Denies write tools in plan mode
- Session allow list persists
- Deny rules take priority over allow rules
- Command patterns match correctly

---

### Step 32: Agent Loop Integration Test (`test/core/agent-loop-tools.test.ts` — NEW)

Test the full agent loop with a mock LLM provider:

```
Test: "Agent loop processes tool calls"
  1. Create MockProvider that returns:
     - First call: response with tool_use (read file)
     - Second call (after tool result): end_turn with summary
  2. Create real ReadTool pointing at a test fixture file
  3. Run agentLoop.processUserInput("Read the test file")
  4. Assert: two LLM calls were made
  5. Assert: tool result was added to messages
  6. Assert: final response includes file content reference

Test: "Agent loop respects max turns"
  1. Create MockProvider that always returns tool_use
  2. Set maxTurns = 3
  3. Run processUserInput
  4. Assert: loop stopped after 3 iterations

Test: "Agent loop handles tool errors gracefully"
  1. Create MockProvider that calls a tool that throws
  2. Assert: error result is added to messages
  3. Assert: loop continues (doesn't crash)
```

---

### Step 33: Security Tests (`test/security/` — NEW)

**test/security/path-validator.test.ts:**
- Allows paths within project root
- Blocks path traversal (../../etc/passwd)
- Resolves relative paths correctly
- Handles symlinks

**test/security/command-filter.test.ts:**
- Detects rm -rf / as dangerous
- Detects fork bombs
- Allows safe commands (ls, git status, npm test)
- Handles edge cases (quoted arguments, pipes)

---

### Step 34: Diff Utilities Test (`test/utils/diff.test.ts` — NEW)

- Generates unified diff between two strings
- Counts added/removed lines correctly
- Handles empty files
- Handles identical files (no diff)

---

### Step 35: End-to-End Verification Checklist

Manual testing sequence to verify the complete Phase 2:

```
1. Start BombaCode: node --import tsx/esm src/index.tsx
   → Verify: Welcome message, header shows model

2. Ask: "What files are in this project?"
   → Verify: LLM uses glob tool, results displayed, tool output shown

3. Ask: "Read the package.json file"
   → Verify: LLM uses read tool, line-numbered content shown

4. Ask: "Add a 'description' field to the test section of package.json"
   → Verify: Permission prompt appears (for edit)
   → Press 'y', edit applied, diff shown

5. Ask: "Run npm test"
   → Verify: Permission prompt for bash, tests execute, output shown

6. Type: /undo
   → Verify: Last edit reverted, confirmation shown

7. Ask: "Search for all files containing 'AgentLoop'"
   → Verify: grep tool used, results listed

8. Type: /tools
   → Verify: All 8 tools listed

9. Type: /mode yolo
   → Verify: Mode changed, subsequent tool calls auto-approved

10. Ask: "Create a file called test-phase2.ts with a hello world function"
    → Verify: Write tool used, file created, no permission prompt (yolo mode)

11. Ask: "Now edit test-phase2.ts to add a console.log"
    → Verify: Edit tool used, diff shown

12. Type: /cost
    → Verify: Token count and cost displayed (should show multi-turn usage)

13. Type: Ctrl+C during a long response
    → Verify: Generation aborted cleanly
```

---

## File Manifest

### New Files (22 files)

| # | File | Type | Lines (est.) |
|---|------|------|-------------|
| 1 | `src/tools/base-tool.ts` | Tool infrastructure | 80 |
| 2 | `src/tools/read.ts` | Tool | 100 |
| 3 | `src/tools/write.ts` | Tool | 90 |
| 4 | `src/tools/edit.ts` | Tool | 130 |
| 5 | `src/tools/bash.ts` | Tool | 150 |
| 6 | `src/tools/glob.ts` | Tool | 70 |
| 7 | `src/tools/grep.ts` | Tool | 170 |
| 8 | `src/tools/todo.ts` | Tool | 60 |
| 9 | `src/tools/ask-user.ts` | Tool | 60 |
| 10 | `src/tools/index.ts` | Tool registry | 25 |
| 11 | `src/core/tool-registry.ts` | Infrastructure | 50 |
| 12 | `src/core/tool-router.ts` | Infrastructure | 120 |
| 13 | `src/core/permission-manager.ts` | Security | 150 |
| 14 | `src/core/checkpoint-manager.ts` | Undo system | 70 |
| 15 | `src/security/path-validator.ts` | Security | 50 |
| 16 | `src/security/command-filter.ts` | Security | 80 |
| 17 | `src/utils/diff.ts` | Utility | 50 |
| 18 | `src/cli/components/ToolOutput.tsx` | UI | 80 |
| 19 | `src/cli/components/PermissionPrompt.tsx` | UI | 90 |
| 20 | `src/cli/components/DiffView.tsx` | UI | 70 |
| 21 | `test/tools/*.test.ts` (6 files) | Tests | 400 |
| 22 | `test/core/*.test.ts` (3 files) | Tests | 250 |

### Modified Files (8 files)

| # | File | Changes |
|---|------|---------|
| 1 | `src/llm/types.ts` | Add ToolResult interface |
| 2 | `src/core/agent-loop.ts` | Full rewrite of processUserInput with tool loop |
| 3 | `src/core/system-prompt.ts` | Add tool guidelines and per-tool descriptions |
| 4 | `src/memory/settings.ts` | Add permissions schema |
| 5 | `src/cli/app.tsx` | Wire tool infrastructure, new state, new commands |
| 6 | `src/cli/components/MessageList.tsx` | Render tool calls inline |
| 7 | `src/cli/components/Header.tsx` | Show active tool indicator |
| 8 | `src/index.tsx` | Add --mode flag |

---

## Integration Points with Phase 1

### Files Phase 2 Builds On (do not break these contracts):

| Phase 1 File | What Phase 2 Uses |
|--------------|-------------------|
| `src/llm/types.ts` | `ToolCall`, `ToolDefinition`, `StreamEvent`, `Message` types |
| `src/llm/openrouter.ts` | `streamMessage()` emitting tool call events |
| `src/llm/anthropic.ts` | `streamMessage()` emitting tool call events |
| `src/llm/cost-tracker.ts` | `recordUsage()` called in agent loop |
| `src/core/message-manager.ts` | `addAssistantMessage()`, `addToolResult()` |
| `src/core/agent-loop.ts` | Entire class refactored but same external API |
| `src/cli/app.tsx` | New state and refs added, same component contract |
| `src/memory/settings.ts` | Extended schema (backward compatible) |
| `src/cli/components/Header.tsx` | New prop (optional, backward compatible) |

### Backward Compatibility Guarantees:
- Phase 1 tests must continue passing
- CLI `--help`, `--version`, `bomba init` unchanged
- Settings without `permissions` field load with defaults
- App works without any tools registered (degrades to Phase 1 chatbot)

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI SDK v6 tool_calls format differences | Agent loop breaks | Verify both providers emit correct StreamEvents in Step 15 |
| Anthropic tool_result format requirements | Tool results ignored by API | Verify buildMessages in Step 16 |
| Ripgrep not installed on user system | Grep tool fails | Native Node.js fallback in grep.ts |
| Large tool results exceed context window | Token budget blown | Truncation in base-tool.ts (30K char limit) |
| Infinite tool loop (LLM always calls tools) | Cost explosion | Max turns limit (Step 17, default 25) |
| Edit tool whitespace mismatch | High edit failure rate | Clear error messages + "read before edit" guidance in system prompt |
| Bash command hangs | CLI frozen | Timeout enforcement (default 120s) |
| Path traversal attack | Security breach | path-validator.ts checks all file paths |
| Permission prompt blocks agent loop | Poor UX | Auto-timeout after 30s + "always allow" option |
| Checkpoint stack memory usage | Memory leak | Max 50 snapshots, oldest dropped |

---

## Implementation Order Summary

```
Week 1 (Implementation):
  Day 1: Batch 1 (infra) + Batch 2 (file tools) → 7 hours
  Day 2: Batch 3 (search/exec) + Batch 4 (agent loop) → 9 hours
  Day 3: Batch 5 (permissions) + Batch 6 (UI) → 7 hours
  Day 4: Batch 7 (integration) + Batch 8 (testing) → 7 hours

Week 2 (Polish):
  - Fix issues found during E2E testing
  - Performance optimization (parallel tool execution)
  - Edge case handling
  - Self-hosting test: use BombaCode to improve BombaCode
```

**After Phase 2 is complete, BombaCode will be a functional coding agent** — capable of reading code, making edits, running tests, searching codebases, and autonomously looping through multi-step tasks. Phase 3 (MCP/Serena integration) builds directly on this foundation.
