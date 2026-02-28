# BombaCode: Exhaustive Step-by-Step Development Plan
## A CLI Coding Agent in TypeScript/Node.js

**Runtime:** Node.js + TypeScript
**UI:** Ink (React for terminals)
**Distribution:** npm (`npx bomba`)
**Model Support:** OpenRouter (frontier) + LiteLLM (open source)
**Code Intelligence:** Serena MCP (LSP-based)
**Languages Supported:** All popular languages (via tree-sitter + LSP)

---

## Project Structure

```
bombacode/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── BOMBA.md                          # Project memory for BombaCode itself
├── src/
│   ├── index.ts                      # Entry point, CLI argument parsing
│   ├── cli/
│   │   ├── app.tsx                   # Main Ink application component
│   │   ├── components/
│   │   │   ├── MessageList.tsx       # Conversation display
│   │   │   ├── InputBar.tsx          # User input with editing
│   │   │   ├── ToolOutput.tsx        # Tool result rendering
│   │   │   ├── Spinner.tsx           # Loading indicators
│   │   │   ├── MarkdownRenderer.tsx  # Terminal markdown rendering
│   │   │   ├── DiffView.tsx          # File diff display
│   │   │   ├── TodoList.tsx          # Task progress tracking
│   │   │   ├── TokenCounter.tsx      # Token usage display
│   │   │   ├── CostTracker.tsx       # Session cost display
│   │   │   ├── PermissionPrompt.tsx  # Allow/deny/ask UI
│   │   │   └── SetupWizard.tsx       # First-run configuration
│   │   ├── themes/
│   │   │   └── default.ts           # Color scheme and styling
│   │   └── keybindings.ts           # Keyboard shortcuts
│   ├── core/
│   │   ├── agent-loop.ts            # Main agentic loop
│   │   ├── message-manager.ts       # Conversation history management
│   │   ├── context-manager.ts       # Token budgeting and compaction
│   │   ├── tool-router.ts           # Tool dispatch and execution
│   │   ├── tool-registry.ts         # Tool registration and discovery
│   │   ├── permission-manager.ts    # Allow/deny/ask permission system
│   │   ├── session-manager.ts       # Save/resume sessions
│   │   └── checkpoint-manager.ts    # Undo system (file snapshots)
│   ├── llm/
│   │   ├── provider.ts              # Abstract LLM provider interface
│   │   ├── openrouter.ts            # OpenRouter implementation
│   │   ├── anthropic.ts             # Direct Anthropic API
│   │   ├── openai-compat.ts         # OpenAI-compatible (LiteLLM, Ollama)
│   │   ├── model-router.ts          # Smart model selection
│   │   ├── token-counter.ts         # Token estimation
│   │   ├── cost-tracker.ts          # Cost calculation and budgets
│   │   ├── prompt-cache.ts          # Prompt caching management
│   │   └── streaming.ts             # SSE stream handling
│   ├── tools/
│   │   ├── base-tool.ts             # Abstract tool class
│   │   ├── read.ts                  # File reading
│   │   ├── write.ts                 # File writing (new files)
│   │   ├── edit.ts                  # File editing (unified diff + string-match)
│   │   ├── bash.ts                  # Shell command execution
│   │   ├── glob.ts                  # File pattern matching
│   │   ├── grep.ts                  # Content search (ripgrep wrapper)
│   │   ├── web-search.ts            # Web search
│   │   ├── web-fetch.ts             # URL fetching
│   │   ├── task.ts                  # Sub-agent spawning
│   │   ├── todo.ts                  # Task tracking
│   │   └── ask-user.ts              # User input collection
│   ├── mcp/
│   │   ├── client.ts                # MCP client implementation
│   │   ├── server-manager.ts        # MCP server lifecycle
│   │   ├── tool-adapter.ts          # MCP tools → internal tools
│   │   └── config.ts                # MCP server configuration
│   ├── memory/
│   │   ├── project-memory.ts        # BOMBA.md loading/parsing
│   │   ├── session-store.ts         # JSONL session storage
│   │   └── settings.ts              # Global/project settings
│   ├── codebase/
│   │   ├── repo-map.ts              # Repository structure mapping
│   │   ├── tree-sitter.ts           # AST parsing (WASM)
│   │   ├── symbol-extractor.ts      # Function/class extraction
│   │   └── file-watcher.ts          # File change detection
│   ├── security/
│   │   ├── sandbox.ts               # Sandbox abstraction
│   │   ├── permission-rules.ts      # Default allow/deny rules
│   │   ├── path-validator.ts        # Directory access control
│   │   └── command-filter.ts        # Dangerous command blocking
│   ├── hooks/
│   │   ├── hook-manager.ts          # Hook registration and execution
│   │   ├── types.ts                 # Hook type definitions
│   │   └── built-in/
│   │       ├── pre-commit-check.ts  # Pre-commit validation
│   │       └── auto-lint.ts         # Auto-lint after edits
│   └── utils/
│       ├── logger.ts                # Structured logging
│       ├── diff.ts                  # Diff parsing and application
│       ├── markdown.ts              # Markdown processing
│       ├── git.ts                   # Git operations helper
│       └── platform.ts              # OS detection and paths
├── test/
│   ├── core/
│   │   ├── agent-loop.test.ts
│   │   ├── message-manager.test.ts
│   │   └── context-manager.test.ts
│   ├── tools/
│   │   ├── edit.test.ts
│   │   ├── bash.test.ts
│   │   └── glob.test.ts
│   ├── llm/
│   │   ├── model-router.test.ts
│   │   └── token-counter.test.ts
│   └── fixtures/
│       └── sample-projects/
└── bin/
    └── bomba                         # CLI entry script
```

---

## Phase 1: Foundation (Day 1 Morning)
### Goal: Skeleton that compiles and runs

#### Step 1.1: Project Initialization

```bash
mkdir bombacode && cd bombacode
npm init -y
```

**package.json setup:**
- name: "bombacode"
- bin: { "bomba": "./bin/bomba" }
- type: "module"
- engines: { "node": ">=18.0.0" }

**Dependencies to install:**
```
# Core
typescript @types/node tsx

# CLI UI
ink ink-text-input ink-spinner ink-select-input react @types/react

# LLM
openai @anthropic-ai/sdk

# Tools
globby fast-glob @iarna/toml js-yaml
tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-javascript
(+ other language grammars as needed)

# MCP
@modelcontextprotocol/sdk

# Utilities
chalk figures cli-cursor strip-ansi
marked marked-terminal
tiktoken (token counting)
diff (unified diff parsing/generation)
zod (schema validation)
conf (config storage)
```

**Dev dependencies:**
```
vitest @vitest/coverage-v8
eslint @typescript-eslint/eslint-plugin
prettier
```

**tsconfig.json:** strict mode, ESM output, target ES2022, JSX react-jsx

#### Step 1.2: CLI Entry Point (`src/index.ts`)

Parse command-line arguments:
```
bomba                          # Start new session (interactive)
bomba "fix the auth bug"       # Start with initial prompt
bomba --continue               # Resume last session
bomba --resume <id>            # Resume specific session
bomba --model <model>          # Override default model
bomba --provider <provider>    # Override provider
bomba --config                 # Open settings
bomba --version                # Show version
bomba --help                   # Show help
bomba init                     # Run setup wizard
bomba mcp add <server>         # Add MCP server
bomba mcp list                 # List MCP servers
bomba mcp remove <server>      # Remove MCP server
```

Use a lightweight arg parser (e.g., `meow` or `commander`).

#### Step 1.3: Setup Wizard (`src/cli/components/SetupWizard.tsx`)

First-run interactive wizard:
1. Welcome message explaining BombaCode
2. Ask for OpenRouter API key (or other provider)
3. Select default model (Claude Opus, Sonnet, Haiku, GPT-5, DeepSeek R1, etc.)
4. Ask about cost preferences (quality-first, balanced, cost-first)
5. Create config directory `~/.bombacode/`
6. Save settings to `~/.bombacode/settings.json`
7. Test API connection
8. Show success message

**Config structure:**
```json
{
  "provider": "openrouter",
  "apiKey": "sk-or-...",
  "defaultModel": "anthropic/claude-sonnet-4-6",
  "models": {
    "fast": "anthropic/claude-haiku-4-5",
    "balanced": "anthropic/claude-sonnet-4-6",
    "powerful": "anthropic/claude-opus-4-6"
  },
  "costMode": "balanced",
  "maxTokenBudget": null,
  "autoCompactAt": 0.85,
  "permissions": {
    "allowFileWrite": "ask",
    "allowBash": "ask",
    "allowNetwork": "ask"
  },
  "mcpServers": {}
}
```

#### Step 1.4: Basic Ink Application Shell (`src/cli/app.tsx`)

Render order (top to bottom):
1. Header bar (model name, token usage, cost)
2. Message list (scrollable conversation)
3. Tool output blocks (collapsible)
4. Separator line
5. Input bar (user typing area)

Use Ink's `<Box>`, `<Text>`, `<Static>` for layout. The message list should auto-scroll to bottom.

**Key Ink patterns:**
- `useInput()` for keyboard handling
- `useApp()` for exit handling
- `useState()` for conversation state
- Render markdown using `marked` + `marked-terminal`
- Syntax highlighting for code blocks

---

## Phase 2: LLM Provider Layer (Day 1 Midday)
### Goal: Send messages to an LLM and get responses

#### Step 2.1: Provider Interface (`src/llm/provider.ts`)

```typescript
interface LLMProvider {
  name: string;
  createMessage(request: LLMRequest): Promise<LLMResponse>;
  streamMessage(request: LLMRequest): AsyncGenerator<StreamEvent>;
  supportsTools(): boolean;
  supportsThinking(): boolean;
  supportsCaching(): boolean;
  getMaxContextTokens(model: string): number;
  estimateTokens(text: string): number;
}

interface LLMRequest {
  model: string;
  systemPrompt: SystemMessage[];
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  thinking?: { enabled: boolean; budgetTokens?: number };
  cacheControl?: CacheConfig[];
}

interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: TokenUsage;
  thinkingContent?: string;
}

interface StreamEvent {
  type: "text_delta" | "tool_call_start" | "tool_call_delta" | "tool_call_end" | "done";
  content?: string;
  toolCall?: Partial<ToolCall>;
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}
```

#### Step 2.2: OpenRouter Provider (`src/llm/openrouter.ts`)

Use the OpenAI SDK with baseURL override:
```typescript
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "X-Title": "BombaCode",
    "HTTP-Referer": "https://github.com/bombacode/bombacode"
  }
});
```

**Implementation details:**
- Map internal ToolDefinition to OpenAI function format
- Parse OpenAI tool_calls response back to internal format
- Handle streaming via SSE (iterate `stream` object)
- Map OpenAI finish_reason to internal stopReason
- Handle rate limits with exponential backoff
- Support model fallback array

#### Step 2.3: Direct Anthropic Provider (`src/llm/anthropic.ts`)

Use the Anthropic SDK directly (for features OpenRouter may not expose):
```typescript
const client = new Anthropic({ apiKey: config.anthropicKey });
```

**Additional features:**
- Extended thinking support
- Prompt caching with cache_control
- Tool use in Anthropic's native format (tool_use blocks)
- Parse content blocks (text, tool_use, thinking)

#### Step 2.4: OpenAI-Compatible Provider (`src/llm/openai-compat.ts`)

Generic provider for any OpenAI-compatible endpoint:
- LiteLLM proxy (localhost:8000)
- Ollama (localhost:11434)
- vLLM (localhost:8000)
- Any other compatible endpoint

Requires only: baseURL + optional apiKey.

#### Step 2.5: Token Counter (`src/llm/token-counter.ts`)

Use `tiktoken` for accurate counting:
- Count message tokens (including role, tool results)
- Count tool definition tokens
- Count system prompt tokens
- Provide fast estimates when tiktoken is unavailable

**Token budget formula:**
```typescript
const maxAllowed = Math.max(contextWindow - 40_000, contextWindow * 0.8);
```

#### Step 2.6: Cost Tracker (`src/llm/cost-tracker.ts`)

Track per-session and per-model costs:
```typescript
interface CostRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  timestamp: number;
}
```

Display running total in header bar. Support budget limits with warnings.

#### Step 2.7: Streaming Handler (`src/llm/streaming.ts`)

Handle SSE streams and buffer tool call arguments:
- Accumulate text deltas → render progressively
- Accumulate tool call JSON → parse when complete
- Handle stream errors with retry
- Support cancellation (Ctrl+C during generation)

---

## Phase 3: Core Agent Loop (Day 1 Afternoon)
### Goal: Working agentic loop with tool execution

#### Step 3.1: Agent Loop (`src/core/agent-loop.ts`)

The heart of BombaCode:

```typescript
async function agentLoop(initialMessages: Message[]): Promise<void> {
  let messages = [...initialMessages];

  while (true) {
    // 1. Check context budget, compact if needed
    messages = await contextManager.ensureWithinBudget(messages);

    // 2. Send to LLM
    const response = await provider.streamMessage({
      model: modelRouter.selectModel(messages),
      systemPrompt: buildSystemPrompt(),
      messages,
      tools: toolRegistry.getToolDefinitions(),
    });

    // 3. Render streaming response to UI
    await renderStream(response);

    // 4. Collect full response
    const fullResponse = await collectResponse(response);
    messages.push({ role: "assistant", ...fullResponse });

    // 5. Check stop reason
    if (fullResponse.stopReason === "end_turn") {
      // Agent finished, wait for user input
      const userMessage = await waitForUserInput();
      if (userMessage === null) break; // User quit
      messages.push({ role: "user", content: userMessage });
      continue;
    }

    if (fullResponse.stopReason === "tool_use") {
      // 6. Execute tool calls (potentially in parallel)
      const results = await executeToolCalls(fullResponse.toolCalls);

      // 7. Add tool results to messages
      for (const result of results) {
        messages.push({
          role: "tool",
          toolUseId: result.id,
          content: result.output
        });
      }
      continue; // Loop back to LLM
    }

    if (fullResponse.stopReason === "max_tokens") {
      // 8. Context exceeded, trigger compaction
      messages = await contextManager.compact(messages);
      continue;
    }
  }
}
```

#### Step 3.2: Message Manager (`src/core/message-manager.ts`)

Manages the conversation message array:

- **append(message)** — Add message, check token budget
- **getMessages()** — Return current message array
- **truncate(targetTokens)** — Remove oldest non-system messages
- **summarize(range)** — Replace message range with summary
- **pin(messageId)** — Mark message as never-removable
- **getTokenCount()** — Total tokens in all messages

**Message format:**
```typescript
type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolUseId: string; content: string }
  | { role: "system"; content: string };
```

#### Step 3.3: Context Manager (`src/core/context-manager.ts`)

Manages token budget across the session:

**Token allocation:**
```
Total context window (e.g., 200K)
  - Reserved for output:     40K
  = Available:              160K
    - System prompt:         ~8K (cached)
    - Tool definitions:      ~6K (cached)
    - Project memory:        ~2K (cached)
    - Working context:      144K
      - Pinned messages
      - Recent messages (last N turns)
      - Older messages (subject to compaction)
```

**Auto-compaction trigger:** When working context reaches 85% of budget.

**Compaction strategy:**
1. Keep system prompt, tool definitions (always)
2. Keep project memory / BOMBA.md (always)
3. Keep initial task description (pinned)
4. Keep last 5-10 turns verbatim
5. Summarize turns 6-20 into a condensed summary
6. Drop turns 21+ (or summarize further)

**Compaction implementation:** Use a fast model (Haiku) to generate the summary of older conversation turns.

#### Step 3.4: Tool Router (`src/core/tool-router.ts`)

Dispatches tool calls to the appropriate tool handler:

```typescript
async function executeToolCalls(calls: ToolCall[]): Promise<ToolResult[]> {
  // Check permissions for each tool call
  for (const call of calls) {
    const permitted = await permissionManager.check(call);
    if (!permitted) {
      return [{ id: call.id, output: "Permission denied by user" }];
    }
  }

  // Execute independent tools in parallel
  const groups = groupByDependency(calls);
  const results: ToolResult[] = [];

  for (const group of groups) {
    const groupResults = await Promise.all(
      group.map(call => executeSingleTool(call))
    );
    results.push(...groupResults);
  }

  return results;
}
```

**Tool result formatting:**
- Results < 500 tokens: include verbatim
- Results 500-2000 tokens: include with truncation marker
- Results > 2000 tokens: head 500 + tail 500 + "[...truncated N tokens...]"

#### Step 3.5: Tool Registry (`src/core/tool-registry.ts`)

Central registry of all available tools (native + MCP):

```typescript
class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void;
  unregister(name: string): void;
  getTool(name: string): Tool | undefined;
  getToolDefinitions(): ToolDefinition[]; // For LLM
  getTools(): Tool[];
}
```

Tools are registered at startup from:
1. Built-in tools (read, write, edit, bash, glob, grep, etc.)
2. MCP server tools (discovered dynamically)

#### Step 3.6: Permission Manager (`src/core/permission-manager.ts`)

Three-tier permission system:

```
Evaluation order: Deny → Ask → Allow

Rules (configurable):
  deny:
    - patterns: ["rm -rf /", "sudo rm", "> /dev/sda"]
    - tools: [] (no tools fully denied by default)

  ask:
    - tools: ["bash", "write", "edit"]
    - patterns: ["npm install", "git push", "git checkout"]

  allow:
    - tools: ["read", "glob", "grep", "web_search", "todo"]
    - patterns: ["echo", "cat", "ls", "pwd"]
```

**Permission UI:** Show the tool name, command/file path, and ask user to approve/deny/always-allow.

**Modes:**
- `normal` — Ask for risky actions (default)
- `auto-edit` — Auto-approve file edits, ask for bash
- `yolo` — Auto-approve everything (for containers/CI)
- `plan` — Read-only only, deny all writes

---

## Phase 4: Core Tools (Day 1 Evening)
### Goal: All essential tools working

#### Step 4.1: Read Tool (`src/tools/read.ts`)

Read file contents with line numbers:

```typescript
{
  name: "read",
  description: "Read file contents. Returns line-numbered content.",
  input_schema: {
    file_path: { type: "string", description: "Absolute or relative file path" },
    offset: { type: "number", description: "Starting line (optional)" },
    limit: { type: "number", description: "Max lines to read (default 2000)" }
  }
}
```

**Implementation:**
- Read file, split into lines
- Add line numbers (right-aligned)
- Truncate lines > 2000 chars
- Return content with line count metadata
- Handle binary files (return "Binary file, N bytes")
- Handle missing files (return clear error)

#### Step 4.2: Write Tool (`src/tools/write.ts`)

Create new files or overwrite existing:

```typescript
{
  name: "write",
  description: "Write content to a file. Creates parent directories if needed.",
  input_schema: {
    file_path: { type: "string" },
    content: { type: "string" }
  }
}
```

**Implementation:**
- Create parent directories (mkdirp)
- Write file atomically (write to temp, rename)
- Create checkpoint before overwrite (for undo)
- Return confirmation with line count

#### Step 4.3: Edit Tool (`src/tools/edit.ts`) — CRITICAL

Support TWO edit modes:

**Mode 1: String-match replacement (simple changes)**
```typescript
{
  name: "edit",
  input_schema: {
    file_path: { type: "string" },
    old_string: { type: "string", description: "Exact text to find" },
    new_string: { type: "string", description: "Replacement text" }
  }
}
```

**Mode 2: Unified diff application (complex changes)**
```typescript
{
  name: "edit_diff",
  input_schema: {
    file_path: { type: "string" },
    diff: { type: "string", description: "Unified diff to apply" }
  }
}
```

**Implementation details:**
1. Read current file content
2. Create checkpoint (save original to undo stack)
3. For string-match: find exact match, fail if 0 or 2+ matches
4. For unified diff: parse hunks, apply with fuzzy matching (±3 lines)
5. Write result atomically
6. Run post-edit validation if available (linter, parser)
7. Return the applied changes

**Fuzzy matching for diffs:** If hunk doesn't match at expected line, search ±3 lines for match. This handles line shifts from previous edits.

#### Step 4.4: Bash Tool (`src/tools/bash.ts`)

Execute shell commands:

```typescript
{
  name: "bash",
  description: "Execute a shell command. Working directory persists.",
  input_schema: {
    command: { type: "string" },
    timeout: { type: "number", description: "Timeout in ms (default 120000)" }
  }
}
```

**Implementation:**
- Spawn child process with `child_process.spawn`
- Capture stdout + stderr
- Enforce timeout (default 2 minutes, max 10 minutes)
- Maintain working directory across calls
- Filter dangerous commands (permission manager)
- Truncate output > 30000 chars
- Return exit code + output

**Dangerous command patterns to block:**
```
rm -rf /
sudo rm
> /dev/sda
chmod 777 /
:(){ :|:& };:
mkfs
dd if=/dev/zero
```

#### Step 4.5: Glob Tool (`src/tools/glob.ts`)

Fast file pattern matching:

```typescript
{
  name: "glob",
  description: "Find files matching glob pattern.",
  input_schema: {
    pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts')" },
    path: { type: "string", description: "Directory to search in (optional)" }
  }
}
```

Use `fast-glob` library. Sort results by modification time. Limit to 1000 results.

#### Step 4.6: Grep Tool (`src/tools/grep.ts`)

Content search using ripgrep (if available) or native:

```typescript
{
  name: "grep",
  description: "Search file contents for regex pattern.",
  input_schema: {
    pattern: { type: "string" },
    path: { type: "string", description: "Directory or file to search" },
    glob: { type: "string", description: "File pattern filter (optional)" },
    context: { type: "number", description: "Lines of context (optional)" }
  }
}
```

**Implementation:**
- Try ripgrep first (`rg` command) — much faster
- Fallback to Node.js native if rg unavailable
- Support regex, case-insensitive, file type filtering
- Return file paths + matching lines with context

#### Step 4.7: Web Search Tool (`src/tools/web-search.ts`)

Basic web search capability:

- Use a search API (SerpAPI, Brave Search, or Tavily)
- Return top 5-10 results with titles, URLs, snippets
- Rate limit to prevent abuse

#### Step 4.8: Task Tool (Sub-Agent) (`src/tools/task.ts`)

Spawn isolated sub-agents:

```typescript
{
  name: "task",
  description: "Spawn a sub-agent for a focused task.",
  input_schema: {
    prompt: { type: "string", description: "Task description" },
    model: { type: "string", description: "Model override (optional)" },
    tools: { type: "array", description: "Tool whitelist (optional)" },
    max_turns: { type: "number", description: "Max agent turns (default 10)" }
  }
}
```

**Implementation:**
- Create new agent loop instance with fresh message history
- Inject subset of tools (principle of least privilege)
- Run to completion (max_turns limit)
- Return final text output to parent
- Sub-agents CANNOT spawn sub-agents (prevent recursion)

#### Step 4.9: Todo Tool (`src/tools/todo.ts`)

Task tracking for complex multi-step work:

```typescript
{
  name: "todo",
  input_schema: {
    todos: [{
      content: { type: "string" },
      status: { enum: ["pending", "in_progress", "completed"] }
    }]
  }
}
```

Render as a visual checklist in the UI.

#### Step 4.10: Ask User Tool (`src/tools/ask-user.ts`)

Collect structured input from user:

```typescript
{
  name: "ask_user",
  input_schema: {
    questions: [{
      question: { type: "string" },
      options: [{ label: string, description: string }]
    }]
  }
}
```

Render as interactive selection in the Ink UI.

---

## Phase 5: System Prompt & Memory (Day 2 Morning)
### Goal: Smart system prompt with project awareness

#### Step 5.1: System Prompt Builder

Assemble system prompt from components:

```typescript
function buildSystemPrompt(): SystemMessage[] {
  return [
    { type: "text", text: CORE_IDENTITY, cache_control: "ephemeral" },
    { type: "text", text: TOOL_GUIDELINES, cache_control: "ephemeral" },
    { type: "text", text: buildProjectContext(), cache_control: "ephemeral" },
    { type: "text", text: buildEnvironmentInfo() }
  ];
}
```

**CORE_IDENTITY:** (~2K tokens)
- You are BombaCode, a CLI coding agent
- You have access to tools for file operations, search, and execution
- Coding style guidelines and best practices
- When to use which tools
- How to handle errors

**TOOL_GUIDELINES:** (~3K tokens)
- Specific guidance for each tool
- When to prefer glob vs grep
- How to make good edits (prefer edit over write)
- When to use task (sub-agent) vs doing it directly

**PROJECT_CONTEXT:** (~variable)
- Contents of BOMBA.md files (project memory)
- Git status summary
- Package.json summary (tech stack)
- Directory structure overview

**ENVIRONMENT_INFO:** (~200 tokens)
- OS, shell, Node version
- Current working directory
- Current date/time
- Available language runtimes

#### Step 5.2: Project Memory (`src/memory/project-memory.ts`)

Load BOMBA.md files in priority order:

```
~/.bombacode/BOMBA.md          # Global (all projects)
./.bomba/BOMBA.md              # Team (version controlled)
./BOMBA.md                     # Project (version controlled)
./BOMBA.md.local               # Personal (gitignored)
```

Each file's contents is injected into the system prompt.

#### Step 5.3: Session Persistence (`src/memory/session-store.ts`)

Save sessions as JSONL files:

```
~/.bombacode/
  sessions/
    <project-hash>/
      index.json                # Session list with metadata
      <session-id>.jsonl        # Full message transcript
```

**Session metadata:**
```json
{
  "id": "uuid",
  "projectPath": "/path/to/project",
  "createdAt": "2026-02-28T10:00:00Z",
  "updatedAt": "2026-02-28T12:30:00Z",
  "model": "anthropic/claude-sonnet-4-6",
  "tokenCount": 45000,
  "cost": 0.35,
  "summary": "Fixed authentication bug in middleware"
}
```

**Resume behavior:**
- `bomba --continue` loads last session's messages
- `bomba --resume <id>` loads specific session
- Compaction applies on resume if context is large

#### Step 5.4: Checkpoint Manager (`src/core/checkpoint-manager.ts`)

Before every file edit, snapshot the original:

```typescript
class CheckpointManager {
  private stack: FileSnapshot[] = [];

  async createCheckpoint(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf-8");
    this.stack.push({ filePath, content, timestamp: Date.now() });
  }

  async undo(): Promise<FileSnapshot | null> {
    const snapshot = this.stack.pop();
    if (snapshot) {
      await fs.writeFile(snapshot.filePath, snapshot.content);
    }
    return snapshot;
  }
}
```

User can press Esc twice to undo the last file change.

---

## Phase 6: MCP Integration & Serena (Day 2 Midday)
### Goal: Connect to Serena and other MCP servers

#### Step 6.1: MCP Client (`src/mcp/client.ts`)

Implement MCP client using the official TypeScript SDK:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

class MCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  async connect(serverConfig: MCPServerConfig): Promise<void> {
    this.transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env
    });

    this.client = new Client({
      name: "bombacode",
      version: "1.0.0"
    });

    await this.client.connect(this.transport);
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, input: Record<string, unknown>): Promise<string> {
    const result = await this.client.callTool({ name, arguments: input });
    return result.content.map(c => c.text || "").join("\n");
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }
}
```

#### Step 6.2: MCP Server Manager (`src/mcp/server-manager.ts`)

Manage lifecycle of MCP server connections:

- Start configured MCP servers on BombaCode launch
- Discover their tools and register in tool registry
- Handle server crashes with restart
- Clean shutdown when BombaCode exits

**Configuration (in settings.json):**
```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/oraios/serena", "serena-mcp-server"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

#### Step 6.3: MCP Tool Adapter (`src/mcp/tool-adapter.ts`)

Convert MCP tools to BombaCode's internal tool format:

```typescript
function adaptMCPTool(mcpTool: MCPToolDefinition, client: MCPClient): Tool {
  return {
    name: `mcp_${mcpTool.name}`,
    description: mcpTool.description,
    inputSchema: mcpTool.inputSchema,
    execute: async (input) => {
      return await client.callTool(mcpTool.name, input);
    }
  };
}
```

#### Step 6.4: Serena Integration

Add Serena to default MCP config and document it:

```bash
bomba mcp add serena
```

This adds the Serena server config and enables symbol-level tools:
- `find_symbol` — Search symbols by name
- `find_referencing_symbols` — Find all references
- `find_referencing_code_snippets` — Reference code context
- `insert_after_symbol` — Insert after a symbol
- `replace_symbol_definition` — Replace a symbol
- `replace_range` — Replace line range

Update system prompt to guide the LLM on when to use Serena tools vs native tools:
- Use `read` for reading entire files
- Use `find_symbol` for navigating to specific functions/classes
- Use `find_referencing_symbols` before refactoring
- Use `replace_symbol_definition` for semantic edits

---

## Phase 7: Model Routing & Cost Optimization (Day 2 Afternoon)
### Goal: Smart model selection and cost control

#### Step 7.1: Model Router (`src/llm/model-router.ts`)

Select optimal model based on task:

```typescript
function selectModel(messages: Message[], config: CostConfig): string {
  const lastUserMessage = getLastUserMessage(messages);
  const estimatedComplexity = estimateComplexity(lastUserMessage);
  const currentCost = costTracker.getSessionCost();

  // Budget check
  if (config.maxBudget && currentCost > config.maxBudget * 0.9) {
    return config.models.fast; // Switch to cheapest
  }

  // Complexity routing
  if (config.costMode === "quality") {
    return config.models.powerful;
  }

  if (config.costMode === "cost") {
    return config.models.fast;
  }

  // Balanced mode
  if (estimatedComplexity < 3) return config.models.fast;
  if (estimatedComplexity < 7) return config.models.balanced;
  return config.models.powerful;
}
```

**Complexity signals:**
- Number of files mentioned
- Keywords: "refactor", "architect", "design" → high
- Keywords: "fix typo", "add comment", "rename" → low
- Length of request
- Presence of code blocks

#### Step 7.2: Prompt Caching (`src/llm/prompt-cache.ts`)

For Anthropic models, use cache_control:

```typescript
function buildCachedSystemPrompt(): SystemMessage[] {
  return [
    {
      type: "text",
      text: CORE_IDENTITY + TOOL_GUIDELINES,
      cache_control: { type: "ephemeral" } // Cache this (~5K tokens)
    },
    {
      type: "text",
      text: projectContext,
      cache_control: { type: "ephemeral" } // Cache this (~2K tokens)
    },
    {
      type: "text",
      text: environmentInfo // Small, changes each call, not cached
    }
  ];
}
```

**Expected savings:** 90% cost reduction on cached tokens, 80% latency reduction.

#### Step 7.3: Model Fallback Chain

When primary model fails, try alternatives:

```typescript
const fallbackChain = [
  "anthropic/claude-sonnet-4-6",    // Primary
  "openai/gpt-5",                    // Fallback 1
  "deepseek/deepseek-r1",            // Fallback 2
];
```

Handle: 429 (rate limit), 500+ (server error), timeout.

---

## Phase 8: Codebase Intelligence (Day 2 Evening)
### Goal: Repository awareness

#### Step 8.1: Repository Map (`src/codebase/repo-map.ts`)

Generate a concise map of the repository:

```typescript
async function generateRepoMap(rootDir: string, maxTokens: number): Promise<string> {
  // 1. Find all source files
  const files = await glob("**/*.{ts,js,py,go,rs,java,rb,php}", { cwd: rootDir });

  // 2. For each file, extract symbols via tree-sitter
  const symbols = await Promise.all(files.map(f => extractSymbols(f)));

  // 3. Build dependency graph (imports/exports)
  const graph = buildDependencyGraph(symbols);

  // 4. Rank files by PageRank importance
  const ranked = pageRank(graph);

  // 5. Select top files within token budget
  const selected = selectWithinBudget(ranked, maxTokens);

  // 6. Format as concise map
  return formatRepoMap(selected);
}
```

**Output format:**
```
src/core/agent-loop.ts
  ├── agentLoop(messages) → void
  ├── executeToolCalls(calls) → ToolResult[]
  └── collectResponse(stream) → LLMResponse

src/llm/provider.ts
  ├── interface LLMProvider
  ├── interface LLMRequest
  └── interface LLMResponse
```

#### Step 8.2: Tree-Sitter Integration (`src/codebase/tree-sitter.ts`)

Use tree-sitter WASM bindings for multi-language parsing:

**Supported languages (via tree-sitter grammars):**
- TypeScript, JavaScript, TSX, JSX
- Python
- Go
- Rust
- Java, Kotlin
- C, C++, C#
- Ruby
- PHP
- Swift
- Bash/Shell
- HTML, CSS, SCSS
- JSON, YAML, TOML
- Markdown

```typescript
import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

const parser = new Parser();
parser.setLanguage(TypeScript.typescript);

const tree = parser.parse(sourceCode);
const rootNode = tree.rootNode;

// Extract function definitions
const functions = rootNode.descendantsOfType("function_declaration");
```

#### Step 8.3: Symbol Extractor (`src/codebase/symbol-extractor.ts`)

Extract meaningful symbols from AST:

- Function/method names + signatures
- Class/interface names + method list
- Type definitions
- Export declarations
- Import statements (for dependency graph)

This powers the repo map and provides structural context to the LLM.

---

## Phase 9: Streaming UI & Polish (Day 2 Night)
### Goal: Professional terminal experience

#### Step 9.1: Markdown Renderer (`src/cli/components/MarkdownRenderer.tsx`)

Render markdown in the terminal:
- Use `marked` + `marked-terminal`
- Syntax highlighting for code blocks (use `cli-highlight` or `prism`)
- Proper heading styles
- Table rendering
- Link rendering (with numbers for reference)
- List rendering with bullets/numbers

#### Step 9.2: Streaming Text Display

Render tokens as they arrive:
- Text appears character by character
- Tool calls show "Calling tool: <name>..." with spinner
- Tool results show in collapsible blocks
- Smooth scrolling as content grows
- Support Ctrl+C to cancel current generation

#### Step 9.3: Diff View (`src/cli/components/DiffView.tsx`)

Show file changes with color coding:
- Green for additions (`+ line`)
- Red for deletions (`- line`)
- Gray for context lines
- File path header
- Line numbers

#### Step 9.4: Token & Cost Display

Header bar showing:
```
BombaCode | claude-sonnet-4-6 | 23.4K/200K tokens | $0.12 session cost
```

Update in real-time as tokens are consumed.

#### Step 9.5: Keyboard Shortcuts

```
Enter        — Send message
Ctrl+C       — Cancel current generation / exit
Ctrl+L       — Clear screen
Esc Esc      — Undo last file change
Up/Down      — Navigate message history
Ctrl+R       — Search message history
/help        — Show available commands
/model       — Switch model
/cost        — Show cost breakdown
/compact     — Force context compaction
/clear       — Clear conversation
/session     — Session management
```

---

## Phase 10: Hooks & Extensibility (Day 3 Morning)
### Goal: Plugin system foundation

#### Step 10.1: Hook Manager (`src/hooks/hook-manager.ts`)

```typescript
type HookPoint =
  | "PreToolUse"
  | "PostToolUse"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "AssistantResponse"
  | "PreFileEdit"
  | "PostFileEdit";

interface Hook {
  point: HookPoint;
  matcher?: RegExp; // Match tool name or pattern
  handler: (context: HookContext) => Promise<HookResult>;
}

interface HookResult {
  proceed: boolean; // Continue or abort?
  modifiedInput?: unknown; // Modified tool input
  message?: string; // Message to display
}
```

#### Step 10.2: Built-in Hooks

**Auto-Lint Hook:** After every file edit, run the project's linter:
```typescript
{
  point: "PostFileEdit",
  handler: async (ctx) => {
    const result = await runLinter(ctx.filePath);
    if (result.errors.length > 0) {
      return { proceed: true, message: `Lint errors: ${result.errors.join(", ")}` };
    }
    return { proceed: true };
  }
}
```

**Pre-Commit Check:** Before git commit, validate staged files.

---

## Phase 11: Testing & Quality (Day 3 Midday)
### Goal: Test the core components

#### Step 11.1: Unit Tests

Priority test targets:
1. **Edit tool** — String-match replacement, diff application, fuzzy matching
2. **Context manager** — Token counting, compaction logic, budget enforcement
3. **Message manager** — Append, truncate, summarize
4. **Token counter** — Accurate estimation
5. **Permission manager** — Rule evaluation, deny/ask/allow
6. **Tool router** — Parallel execution, result formatting

#### Step 11.2: Integration Tests

- Full agent loop with mock LLM provider
- Tool execution with real filesystem (in temp dir)
- MCP client/server communication
- Session save/resume round-trip

#### Step 11.3: Self-Hosting Test

**The ultimate test:** Use BombaCode to improve BombaCode itself.

```bash
cd bombacode
npx bomba "Read the README and suggest improvements"
```

If BombaCode can read its own code, make edits, and run tests — it's ready.

---

## Phase 12: Distribution & Documentation (Day 3 Afternoon)

#### Step 12.1: npm Package Setup

- Set `"bin": { "bomba": "./bin/bomba" }` in package.json
- Create bin/bomba shebang script: `#!/usr/bin/env node`
- Build TypeScript to JS via tsx or esbuild
- Test: `npx bomba --version`

#### Step 12.2: README.md

- Installation instructions
- Quick start guide
- Configuration reference
- Tool reference
- MCP setup (Serena, GitHub, etc.)
- BOMBA.md documentation
- Model support matrix

#### Step 12.3: BOMBA.md for BombaCode itself

Create the project memory file so BombaCode knows about itself:

```markdown
# BombaCode Project Context

## Architecture
- TypeScript + Node.js CLI application
- Ink (React) for terminal UI
- OpenRouter for frontier models, LiteLLM for open source
- MCP protocol for tool extensibility

## Key Patterns
- Agent loop in src/core/agent-loop.ts
- Tools implement the Tool interface from src/tools/base-tool.ts
- All file edits create checkpoints for undo
- Use unified diff format for complex edits

## Conventions
- Use TypeScript strict mode
- ESM modules only (no CommonJS)
- Vitest for testing
- Use Zod for all runtime schema validation
```

---

## Summary: Implementation Priority Order

| # | Component | Critical? | Time Est. |
|---|-----------|-----------|-----------|
| 1 | Project scaffold + tsconfig + deps | Yes | 30 min |
| 2 | Setup wizard + config | Yes | 1 hour |
| 3 | Ink shell (header, messages, input) | Yes | 2 hours |
| 4 | LLM provider (OpenRouter) | Yes | 2 hours |
| 5 | Streaming handler | Yes | 1 hour |
| 6 | Agent loop (core loop) | Yes | 2 hours |
| 7 | Message manager | Yes | 1 hour |
| 8 | Read tool | Yes | 30 min |
| 9 | Write tool | Yes | 30 min |
| 10 | Edit tool (string-match) | Yes | 1 hour |
| 11 | Bash tool | Yes | 1 hour |
| 12 | Glob tool | Yes | 30 min |
| 13 | Grep tool | Yes | 30 min |
| 14 | Permission manager | Yes | 1 hour |
| 15 | Context manager + compaction | Yes | 2 hours |
| 16 | Token counter + cost tracker | Yes | 1 hour |
| 17 | System prompt builder | Yes | 1 hour |
| 18 | BOMBA.md loading | Yes | 30 min |
| 19 | Session persistence | Important | 1.5 hours |
| 20 | Checkpoint manager (undo) | Important | 1 hour |
| 21 | MCP client | Important | 2 hours |
| 22 | Serena integration | Important | 1 hour |
| 23 | Model router | Important | 1 hour |
| 24 | Edit tool (unified diff) | Important | 2 hours |
| 25 | Task tool (sub-agents) | Important | 2 hours |
| 26 | Todo tool | Nice | 30 min |
| 27 | Ask user tool | Nice | 30 min |
| 28 | Web search/fetch | Nice | 1 hour |
| 29 | Tree-sitter repo map | Nice | 3 hours |
| 30 | Hook system | Nice | 1.5 hours |
| 31 | Markdown renderer | Nice | 1 hour |
| 32 | Diff view UI | Nice | 1 hour |
| 33 | Tests | Important | 3 hours |
| 34 | npm packaging | Yes | 30 min |

**Total estimated: ~38 hours of focused development**

**Weekend-realistic scope (items 1-22):** ~22 hours → achievable in an intense weekend with AI assistance. Items 23-34 follow in the next week.

---

## Post-Weekend Roadmap

### Week 2: Polish & Advanced Features
- Unified diff editing
- Tree-sitter repo mapping
- Hook system
- Comprehensive tests
- Model routing optimization

### Week 3: Enterprise Features
- LiteLLM proxy integration
- Ollama/local model support
- Advanced sandboxing (Landlock/Seatbelt)
- Audit logging
- Session forking

### Week 4: Ecosystem
- Plugin system (installable bundles)
- LSP integration (direct, not just via Serena)
- Git worktree support for parallel agents
- Embedding-based code search
- Community MCP server registry

### Month 2: Scale
- Air-gapped deployment support
- Team features (shared BOMBA.md via git)
- Performance optimization
- v1.0 open source release
