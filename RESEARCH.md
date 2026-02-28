# BombaCode: Comprehensive Research Report
## Building a Production-Grade CLI Coding Agent in TypeScript/Node.js

**Date:** February 28, 2026
**Goal:** Build a fully usable, self-building CLI coding agent supporting frontier models via OpenRouter + open source LLMs via LiteLLM

---

## Table of Contents

1. [Architecture Overview: How Coding Agents Work](#1-architecture-overview)
2. [The Agent Loop: Core Execution Engine](#2-the-agent-loop)
3. [Tool System Design](#3-tool-system-design)
4. [File Editing Approaches](#4-file-editing-approaches)
5. [Context Management & Token Optimization](#5-context-management)
6. [Codebase Indexing, Mapping & Search](#6-codebase-indexing)
7. [Multi-Agent Orchestration](#7-multi-agent-orchestration)
8. [Sandboxing & Security](#8-sandboxing--security)
9. [Session & Conversation Persistence](#9-session--conversation-persistence)
10. [Project Memory System](#10-project-memory-system)
11. [Multi-Model Support: OpenRouter & LiteLLM](#11-multi-model-support)
12. [Open Source Model Integration](#12-open-source-model-integration)
13. [Serena & LSP-Based Code Intelligence](#13-serena--lsp-based-code-intelligence-mcp-servers)
14. [MCP Integration (General)](#14-mcp-integration-general)
15. [Hooks & Plugin System](#15-hooks--plugin-system)
16. [Competitive Analysis Matrix](#16-competitive-analysis)
17. [Recommended Architecture for BombaCode](#17-recommended-architecture)
18. [Implementation Priorities](#18-implementation-priorities)
19. [Sources & References](#19-sources)

---

## 1. Architecture Overview

### How Modern CLI Coding Agents Are Built

All production coding agents follow the same fundamental pattern: an **agentic harness** around an LLM that provides tools, context management, and an execution environment.

**Technology Stacks of Leading Agents:**

| Agent | Language | UI Framework | Key Libraries |
|-------|----------|-------------|---------------|
| Claude Code | TypeScript/Node.js + Bun | React + Ink (terminal) | Tree-sitter WASM, ripgrep |
| OpenAI Codex CLI | TypeScript | Terminal | OpenAI Responses API |
| OpenCode | Go + JS | Bubble Tea (Go TUI) | SQLite, MCP clients |
| Aider | Python | Terminal | Tree-sitter, NetworkX, GitPython |
| Goose (Block) | Rust + Python | CLI + Desktop | MCP-native |
| Cline | TypeScript | VS Code Extension | Protocol Buffers |

**Key Insight:** Claude Code is a 10.5MB self-contained CLI binary (cli.js), bundled with Bun. 90% of Claude Code was written by itself.

### Three-Phase Workflow (Universal Pattern)

Every effective coding agent follows this cycle:

1. **Gather Context** - Search files, read code, understand the codebase
2. **Take Action** - Edit files, run commands, make changes
3. **Verify Results** - Run tests, check work, adjust based on feedback

These phases blend together in a continuous feedback loop.

---

## 2. The Agent Loop

### Core Pattern

The agent loop is the heartbeat of every coding agent. It's deceptively simple:

```
while (response.stop_reason === "tool_use") {
    response = await llm.createMessage(messages, tools, system_prompt);

    for (const toolCall of response.tool_calls) {
        const result = await executeTool(toolCall.name, toolCall.input);
        messages.push({ type: "tool_result", tool_use_id: toolCall.id, content: result });
    }

    messages.push(response);
}
```

### Stop Reasons

The LLM can stop for several reasons:
- `tool_use` - Wants to call a tool (loop continues)
- `end_turn` - Finished naturally (loop ends, await user input)
- `max_tokens` - Hit token limit (triggers compaction)
- `pause_turn` - Server-side loop hit iteration limit
- `stop_sequence` - Hit custom stop sequence

### Request Cycle (Claude Code)

```
1. Send: messages[] + tools[] + system_prompt → Claude API
2. Receive: response with stop_reason
3. If stop_reason == "tool_use":
   a. Execute all tool calls in response
   b. Append tool_result blocks to messages
   c. Loop back to step 1
4. If stop_reason != "tool_use":
   Loop terminates, await next user input
```

### OpenAI Codex Approach

Codex uses the Responses API with SSE streaming. Events trigger either tool invocations or reasoning outputs. The "inner loop" continues until the LLM returns a "done" event.

**Critical Performance Insight:** Without prompt caching, token consumption is **quadratic** (each turn replays all context). With caching, it becomes **linear** - up to 80% latency reduction and 90% cost reduction.

---

## 3. Tool System Design

### Core Tool Set (What Every Agent Needs)

| Category | Tools | Purpose |
|----------|-------|---------|
| File Operations | Read, Write, Edit | File manipulation |
| Search | Glob, Grep (ripgrep) | Pattern/content search |
| Execution | Bash/Shell | Commands, scripts, git |
| Web | WebSearch, WebFetch | Internet access |
| Orchestration | Task, TodoWrite | Multi-agent, planning |
| Navigation | LSP integration | Go-to-definition, find-references |

### Tool Definition Format

Tools are defined via JSON Schema and injected into the system prompt:

```json
{
  "name": "read_file",
  "description": "Read contents of a file at the given path. Returns line-numbered content.",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Absolute path to the file to read"
      },
      "offset": {
        "type": "number",
        "description": "Line number to start reading from (optional)"
      },
      "limit": {
        "type": "number",
        "description": "Max lines to read (optional, default 2000)"
      }
    },
    "required": ["file_path"]
  }
}
```

### Tool Description Best Practices

The quality of tool descriptions directly determines LLM effectiveness:

1. **Clear Purpose** - What the tool does in simple terms
2. **Input Requirements** - What data needed, with examples
3. **Expected Outputs** - What the tool returns
4. **Constraints** - Limitations and requirements
5. **Error Conditions** - How failures are communicated
6. **Usage Guidance** - When to use vs alternatives

**Key Finding:** Claude Code's system prompt is modular - ~269 base tokens + 110+ conditionally-loaded tool descriptions. Tool descriptions are injected based on context (environment, permissions, session state).

### Tool Result Formatting

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_abc123",
  "content": "File contents here..."
}
```

Large tool results should be truncated intelligently:
- < 500 tokens: Include verbatim
- 500-2000 tokens: Include with context markers
- &gt; 2000 tokens: Head 500 + Tail 500 + summary of hidden content

### Parallel Tool Execution

Modern APIs support multiple tool calls in a single response. Execute independent tools in parallel for 3-4x latency reduction:

```
4 API calls x 300ms each:
  Sequential: 1,200ms
  Parallel:     300ms
```

### LSP Integration (Critical Differentiator)

Language Server Protocol transforms agents from text-based to semantically-aware:

- **Go to Definition** - Resolves across files and modules
- **Find References** - All uses of a symbol workspace-wide
- **Diagnostics** - Type errors after every edit
- **Workspace Symbol Search** - Find symbols across entire codebase

Claude Code shipped native LSP support in December 2025. This prevents wasting tokens on code navigation orchestration.

---

## 4. File Editing Approaches

### Comparison of All Approaches

| Approach | Accuracy | LLM Effort | Whitespace Sensitivity | Best For |
|----------|----------|-----------|----------------------|----------|
| **String-Match** (Claude Code) | 20-40% | Low | High | Simple, single changes |
| **Unified Diff** (Aider) | 61%+ | Medium | Medium | Multiple changes, complex diffs |
| **Hash-Line** | 68%+ | Medium | None | Duplicate content handling |
| **AST-Based** | 85%+ | High | None | Structural changes |
| **Line-Number** | 40-50% | Low | None | Exact targeting |
| **Whole File** | 30-40% | High | None | Complete rewrites |

### String-Match Replacement (Claude Code)

```json
{
  "file_path": "path/to/file.ts",
  "old_string": "exact text to match\nincluding whitespace",
  "new_string": "replacement text"
}
```

**Why this design:**
- Robust: Works even if file changes between read and edit
- Simple: No line number tracking required
- Fails explicitly when ambiguous (multiple matches)

**Downsides:**
- Whitespace sensitivity causes frequent failures
- Large changes are difficult
- Requires unique context for matching

### Unified Diff (Aider) - Recommended

```diff
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,7 +10,7 @@
 function authenticate(user: string) {
-  return checkPassword(user);
+  return checkPasswordWithMFA(user);
 }
```

**Critical finding:** Unified diffs improved GPT-4 Turbo from 20% to 61% accuracy. Also reduced "lazy commenting" (where LLM elides code) by 3x.

### Hash-Line Format (Newest Innovation)

Include line hashes to uniquely identify target lines:

**Result:** Grok Code Fast improved from 6.7% to 68.3% success rate.

### Recommendation for BombaCode

Support multiple edit formats:
1. **Primary:** Unified diff (best accuracy-to-complexity ratio)
2. **Fallback:** String-match for simple single-line changes
3. **Emergency:** Whole file rewrite as last resort

Consider implementing a **validation step** after each edit - run the file through a parser to confirm it's still valid.

---

## 5. Context Management

### The Token Budget Formula

```
maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)
```

This ensures a 40K token buffer for new interactions and model reasoning.

### Token Distribution (Typical)

| Component | % of Tokens | Notes |
|-----------|-------------|-------|
| System prompts | 5-10% | Stable, cacheable |
| Tool definitions | 10-20% | Scales with # of tools |
| Conversation history | 30-50% | Grows unbounded |
| Code context | 20-40% | Highly variable |
| Reserved output | 5-10% | Fixed per call |

### Recommended Budget Allocation (128K model)

```
Reserve:              40,000 tokens (fixed buffer)
Available:            88,000 tokens

  System prompts:      8,000 (cached)
  Tool definitions:    6,000 (cached)
  Code context:       20,000 (dynamic retrieval)
  Conversation:       35,000 (sliding window)
  Working memory:     10,000 (current task)
  Reasoning space:     9,000 (model output)
```

### Conversation History Management

**Sliding Window Architecture:**
```
[Full Context Window]
  System Prompt (fixed, cacheable)
  Tool Definitions (fixed, cacheable)
  Pinned Context (critical info)
  Sliding Window of Recent Messages
    Last N turns (verbatim)
    Older content (summarized)
    Dropped content (oldest)
  Reserved Space (new interactions)
```

**Auto-Compaction Triggers:**
- Claude Code: triggers at 95% token usage
- GitHub Copilot: auto-compresses at 95%
- Recommendation: trigger at 80-90%

### What Survives Compaction (Priority Order)

1. System instructions and role definitions
2. Initial problem statement / task context
3. Key architectural decisions
4. Recent conversation turns (last 5-10)
5. File paths and function signatures
6. Test results (most recent)
7. Verbose tool output (summarized)
8. Older conversation turns (dropped first)

### The "Lost in the Middle" Problem

**Critical finding:** Performance degrades 30-50% for information in the middle of context. Place critical information at the **start** and **end** of context.

### Prompt Caching (Essential)

```typescript
// Cache stable components for 90% cost reduction
system: [
  {
    type: "text",
    text: systemPrompt, // ~5K tokens - cached
    cache_control: { type: "ephemeral" }
  },
  {
    type: "text",
    text: codingGuidelines, // ~10K tokens - cached
    cache_control: { type: "ephemeral" }
  }
]
```

**Impact:** Up to 80% latency reduction, 90% cost reduction on cached content.

---

## 6. Codebase Indexing

### Aider's Repository Map (Gold Standard)

Aider pioneered structured repository mapping using tree-sitter:

1. **AST Parsing** - Parse all files into Abstract Syntax Trees
2. **Symbol Extraction** - Extract function/class names, types, signatures
3. **Dependency Graph** - Build graph: nodes=files, edges=imports/calls
4. **PageRank Ranking** - Identify most important files
5. **Token-Limited Output** - Select top symbols within budget

```
aider --map-tokens 1000  # Default token allocation for repo map
```

### Why Repository Mapping Works

- Central hub files (used by many others) score high
- Utility files (used everywhere) get priority
- Peripheral files get lower priority
- Captures **structural importance**, not just textual similarity

### Hybrid Search Strategy

Combine multiple approaches for best results:

```
Query: "get user by email"
  Semantic search → files with similar meaning
  Lexical search (BM25) → files with exact keywords
  AST-based → structural code elements

  Merge + Rerank → Final relevant files
```

### RAG for Code (When Repository > 100 files)

```
Query → Embedding Model → Vector representation
  → Vector DB → Search → Top-K files/chunks
  → Retrieved Context + Original Query
  → LLM → Generated response
```

**AST-Aware Chunking** (cAST approach):
- Parse code into AST
- Greedily merge AST nodes into chunks
- Respect syntactic boundaries (don't split functions)
- 5.5 point average improvement over naive chunking

### Implementation Tiers

| Tier | Approach | Cost | Quality |
|------|----------|------|---------|
| 1 | Just-in-time grep/glob | Low | Low |
| 2 | Basic embedding index | Medium | Medium |
| 3 | Hybrid search + rerank | Medium-High | High |
| 4 | Graph-based (RANGER) | High | Very High |

**Recommendation for BombaCode:** Start with Tier 1 (grep/glob), add Tier 2 (embeddings) when needed, plan for Tier 3.

---

## 7. Multi-Agent Orchestration

### Claude Code's Task Tool

Claude Code spawns sub-agents via the `Task` tool:

- **Separate context window** - Each sub-agent operates in isolation
- **Independent message history** - Own conversation transcript
- **Focused output** - Only relevant results bubble up
- **No nesting** - Sub-agents cannot spawn sub-agents (prevents recursion)

**Built-in Sub-Agent Types:**
- **Explore Agent** (Haiku) - Fast, read-only codebase analysis
- **Plan Agent** (Sonnet/Opus) - Research and planning
- **General-Purpose** - Exploration + modification

### Orchestration Patterns

**1. Orchestrator-Worker** (Most Common for Coding)
```
User Input → Orchestrator Agent
  ├→ Worker 1 (subtask A)  [parallel]
  ├→ Worker 2 (subtask B)  [parallel]
  └→ Worker 3 (subtask C)  [parallel]
  → Result Synthesis → Output
```

**2. Pipeline/Chain** (Sequential Processing)
```
Input → Agent A (Transform) → Agent B (Refine) → Agent C (Verify) → Output
```

**3. Hierarchical** (Large Features)
```
Strategic Agent (top)
  → Tactical Agents (middle): Research, Implement, Verify
    → Execution Agents (bottom): Code Writer, Tester, Deployer
```

### Pattern Selection Guide

| Task Type | Best Pattern |
|-----------|-------------|
| Simple changes | Direct execution |
| Parallel operations | Orchestrator-Worker |
| Sequential refinement | Pipeline |
| Complex decomposition | Hierarchical |
| Risk mitigation | Hierarchical + Reviewer |
| Cost-sensitive | Pipeline |
| Speed-sensitive | Orchestrator-Worker |

### Git Worktrees for Parallel Development

Cursor uses up to 8 concurrent agents, each in their own git worktree:

```
Repository/
  .git/                    (shared)
  worktree-auth/          (Agent A)
  worktree-db/            (Agent B)
  worktree-api/           (Agent C)
```

**Advantages:** Lightweight (single .git directory), automatic sync, no file conflicts.

**Limitation:** Worktrees provide file-level isolation only, not runtime isolation (shared DB, Docker daemon, ports).

### Agent Specialization

| Agent Type | Tools | Model | Purpose |
|-----------|-------|-------|---------|
| Explorer | Read, Glob, Grep | Haiku | Fast codebase search |
| Planner | Read, Glob, Grep, WebSearch | Sonnet/Opus | Implementation planning |
| Coder | Read, Write, Edit, Bash, Glob, Grep | Sonnet | Code changes |
| Reviewer | Read, Grep, Glob | Sonnet/Opus | Quality assurance |
| Tester | Bash, Read, Grep | Haiku | Test execution |

**Principle of Least Privilege:** Each agent gets minimum tools needed.

---

## 8. Sandboxing & Security

### Four Permission Modes (Claude Code Model)

| Mode | User Approval | Use Case |
|------|--------------|----------|
| Normal | Required for risky actions | Default, interactive |
| Auto-accept Edits | Not needed for file writes | Faster iteration |
| Plan | Read-only only | Safe exploration |
| Bypass | Not required | CI/CD, containers only |

### Sandboxing Architectures

**1. Lightweight Containers (Docker)**
- Private Docker daemon per sandbox
- Allow/deny network lists
- Default: no network access

**2. Kernel-Level Restrictions**
- Linux: Landlock (filesystem) + Seccomp (syscalls)
- macOS: Seatbelt framework
- Windows: Windows Sandbox API

**3. MicroVMs (Firecracker)**
- Each workload gets its own Linux kernel
- Strongest isolation available
- ~50-100ms startup time

### Permission System Design

```
Evaluation order: Deny → Ask → Allow

Rules:
  deny_patterns: ["rm -rf", "sudo", "chmod"]
  ask_patterns: ["npm install", "git push"]
  allow_patterns: ["echo", "cat", "ls", "grep"]
```

### File System Access Controls

```
Read Access: Entire project directory (configurable exclusions)
Write Access: Current working directory and subdirectories only
Excluded: /System, /etc, ~/.ssh, ~/.aws, ~/.env
```

### Network Isolation

Route internet through unix domain socket → proxy server → domain whitelist. Prevents DNS rebinding and data exfiltration.

**Critical:** Effective sandboxing requires BOTH filesystem AND network isolation.

---

## 9. Session & Conversation Persistence

### Session Storage (Claude Code Model)

```
~/.bombacode/
  history.jsonl                    # Global index
  projects/
    <project-hash>/
      sessions-index.json          # Session metadata
      <session-id>.jsonl           # Full transcript
      memory/                      # Auto-captured learnings
  settings.json                    # Global settings
```

### Session Commands

```bash
bomba                              # Start new session
bomba --continue                   # Resume last session
bomba --resume <session-id>        # Resume specific session
bomba --fork-session               # Branch off current session
```

### Checkpoints (Undo System)

Before any file edit, snapshot file contents. User can press Esc twice to rewind. This is separate from git - covers file changes within a session.

---

## 10. Project Memory System

### Memory Hierarchy

```
~/.bombacode/BOMBA.md              # Global (all projects)
./.bomba/BOMBA.md                  # Team/Org (version controlled)
./BOMBA.md                         # Project (version controlled)
./BOMBA.md.local                   # Personal (auto-ignored)
```

### What Goes In Project Memory

```markdown
# Project Context

## Architecture
- Stack: TypeScript + React + Node.js
- Key patterns: Using middleware for auth

## Conventions
- Use TypeScript strict mode
- Test coverage minimum: 80%

## Constraints
- Do not modify database migrations
- Do not touch payment processing code
```

**Best Practices:**
- Write imperatives: "Use TypeScript strict" not "The project uses TypeScript"
- Every line consumes context budget - be concise
- Don't treat it as documentation wiki
- Use `.local` for personal preferences

---

## 11. Multi-Model Support

### OpenRouter Integration

OpenRouter normalizes all providers to OpenAI Chat API format. Drop-in replacement:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const response = await client.chat.completions.create({
  model: "anthropic/claude-opus-4-6",
  messages: [...],
  tools: [...],
  stream: true
});
```

**Key Features:**
- 500+ models from single API
- Full tool calling support (normalized across models)
- SSE streaming with tool call streaming
- Model fallbacks: specify array of models, auto-failover
- Rate limiting: $1 credit = 1 RPS, max 500 RPS

### LiteLLM Integration (for Open Source Models)

LiteLLM is Python-native. Use as sidecar proxy:

```bash
# Run LiteLLM proxy
docker run -p 8000:8000 ghcr.io/berriai/litellm:latest

# Or install and run
pip install litellm && litellm --config litellm-config.yaml
```

Then connect from TypeScript via OpenAI SDK:

```typescript
const client = new OpenAI({
  apiKey: process.env.LITELLM_API_KEY,
  baseURL: "http://localhost:8000/v1",
});
```

**LiteLLM Config:**
```yaml
model_list:
  - model_name: "claude-opus"
    litellm_params:
      model: "anthropic/claude-opus-4-6"
      api_key: os.environ/ANTHROPIC_KEY

  - model_name: "deepseek"
    litellm_params:
      model: "deepseek/deepseek-r1"
      api_key: os.environ/DEEPSEEK_KEY

  - model_name: "local-qwen"
    litellm_params:
      model: "ollama/qwen:coder"
      api_base: "http://localhost:11434"
```

### Model Routing Strategy

```typescript
function selectModel(task: TaskType, complexity: number): string {
  if (complexity < 3) return "claude-haiku-4-5";     // Cheap, fast
  if (complexity < 7) return "claude-sonnet-4-6";    // Balanced
  return "claude-opus-4-6";                           // Maximum capability
}
```

**Enterprise results:** 46% cost reduction by routing 60% to Haiku, 30% to Sonnet, 10% to Opus.

### Provider Abstraction Layer

```typescript
interface LLMProvider {
  call(request: LLMRequest): Promise<LLMResponse>;
  supportsTools(): boolean;
  getMaxContext(): number;
  getName(): string;
}

interface LLMRequest {
  messages: Message[];
  model?: string;
  tools?: ToolDefinition[];
  stream?: boolean;
  maxTokens?: number;
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: "end_turn" | "tool_use" | "max_tokens";
}
```

### Handling Anthropic vs OpenAI Format Differences

| Aspect | OpenAI Format | Anthropic Format |
|--------|---------------|------------------|
| Tool Definition | `function` property | Direct tool object with `input_schema` |
| Tool Response | `tool_calls` array | `tool_use` block in content |
| Parallel Tools | Native | Sequential by default |
| Thinking | N/A | Extended thinking with budget |
| Caching | Automatic | Explicit `cache_control` |

### Fallback Strategy

```typescript
const models = [
  "anthropic/claude-opus-4-6",
  "openai/gpt-5",
  "deepseek/deepseek-r1"
];

for (const model of models) {
  try {
    return await client.chat.completions.create({ model, messages, tools });
  } catch (error) {
    if (error.status === 429) continue;  // Rate limited, try next
    if (error.status >= 500) { await backoff(); continue; }
    throw error;  // Non-retryable
  }
}
```

---

## 12. Open Source Model Integration

### Models with Good Tool Use Support

| Model | Provider | Tool Support | Best Use |
|-------|----------|--------------|----------|
| Qwen3 Coder | Alibaba | Full | Local coding agent |
| GLM-4.7 | Zhipu | Excellent | Complex reasoning |
| DeepSeek V3 | DeepSeek | Strong | Cost-effective |
| Mistral Large 3 | Mistral | Good | General tasks |

### Local Serving Options

| Aspect | Ollama | vLLM |
|--------|--------|------|
| Setup | Simplest | Moderate |
| Throughput | 1-10 RPS | 50-100 RPS |
| Tool Support | 2026+ | Native |
| Best For | Development/Testing | Production |

### Ollama Integration

```bash
ollama pull qwen:coder
ollama serve  # localhost:11434
```

```typescript
const localClient = new OpenAI({
  apiKey: "ollama",
  baseURL: "http://localhost:11434/v1"
});
```

### Handling Models Without Native Tool Use

For models that don't support function calling, simulate it:

```typescript
const prompt = `${userPrompt}

Available tools: ${JSON.stringify(tools)}

Respond with JSON: {"tool_calls": [{"name": "...", "input": {...}}]}
Or respond with plain text if no tools needed.`;
```

---

## 13. Serena & LSP-Based Code Intelligence MCP Servers

### What is Serena?

Serena (https://github.com/oraios/serena) is a free, open-source **MCP server** that provides **semantic code intelligence** to any LLM. It does NOT contain an LLM itself — it provides the *tools* that turn an LLM into a code-aware agent. The key innovation is leveraging **Language Server Protocol (LSP)** infrastructure rather than building custom parsers.

**Critical clarification:** Claude Code does NOT have Serena built-in. Serena is a separate, optional MCP server that *enhances* Claude Code (or any MCP-compatible agent). Users add it via `claude mcp add serena`.

### Architecture

```
┌─────────────────────────────────────────┐
│  MCP Client (Claude Code, BombaCode,    │
│  Cursor, Cline, etc.)                   │
└────────────────────┬────────────────────┘
                     │ MCP Protocol (JSON-RPC 2.0)
┌────────────────────▼────────────────────┐
│     Serena MCP Server (Python)          │
│  - Tool definitions & orchestration     │
│  - Symbol-level code understanding      │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│      Solid-LSP (Custom Sync LSP)        │
│  - Derived from multilspy               │
│  - Pure synchronous LSP calls           │
│  - Symbolic logic extensions            │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│  Language Server Implementations:       │
│  - Pyright (Python)                     │
│  - TypeScript Language Server           │
│  - rust-analyzer (Rust)                 │
│  - gopls (Go)                           │
│  - Eclipse JDTLS (Java)                 │
│  - 25+ others (30+ languages total)    │
└─────────────────────────────────────────┘
```

### Serena's Tools

| Tool | Purpose |
|------|---------|
| `find_symbol` | Global/local search for symbols by name/substring, filtered by type |
| `find_referencing_symbols` | Find symbols that reference a given symbol |
| `find_referencing_code_snippets` | Code snippets where a symbol is referenced |
| `insert_after_symbol` | Insert content after end of a symbol's definition |
| `replace_symbol_definition` | Replace entire definition of a symbol |
| `replace_range` | Replace a range of lines within a file |

### Why Serena Matters: Token Efficiency

Instead of reading entire files (thousands of tokens), Serena extracts only the relevant symbols:

```
Traditional approach:
  "Read src/auth.ts" → 2,000 tokens (entire 500-line file)

Serena approach:
  "find_symbol authenticate" → 80 tokens (just the function signature + body)
  "find_referencing_symbols authenticate" → 120 tokens (callers only)
```

**Result:** ~70% token savings on large codebases.

### Why LSP Instead of Tree-sitter?

| Aspect | Tree-sitter | LSP (Serena) |
|--------|-------------|--------------|
| Parsing | Syntax only (AST) | Full semantic analysis |
| Type info | None | Full type resolution |
| Cross-file | Manual | Automatic (go-to-definition) |
| References | Manual grep | Precise find-all-references |
| Languages | Per-language grammar | Per-language server (30+) |
| Maturity | Good | Decades of IDE investment |
| Speed | Very fast | Slower startup, fast queries |

**Key insight from research:** Tree-sitter and LSP are complementary — tree-sitter for fast structural parsing, LSP for deep semantic understanding. Aider uses tree-sitter for repo mapping, Serena uses LSP for precise symbol operations.

### Similar MCP Coding Servers (Ecosystem)

| Tool | Approach | Languages | Editing? | Focus |
|------|----------|-----------|----------|-------|
| **Serena** | LSP | 30+ | Yes | Symbol-level navigation + editing |
| **Claude Context** | Vector DB (Milvus) | 15+ | No | Semantic code search (~40% token savings) |
| **Code Pathfinder** | AST analysis | Python only | No | Call graphs, dataflow tracking |
| **CodeGrok** | Tree-sitter + embeddings | Most | No | Semantic search (10x context efficiency) |
| **CodeGraph** | Multi-layered analysis | Many | No | Architecture understanding |
| **VSCode MCP** | VSCode's own LSP | All | No | Real-time diagnostics, type info |

**Serena is unique** in combining both symbol-level navigation AND code editing. Others are read-only.

### How This Impacts BombaCode's Architecture

**Option A: Build native tools + support Serena as optional MCP**
- Build basic Read/Write/Edit/Glob/Grep as native tools
- Support MCP protocol so users can add Serena (and other MCP servers)
- BombaCode works standalone, Serena supercharges it on large projects

**Option B: Use Serena as the primary code intelligence layer**
- Depend on Serena for all code navigation/editing
- Lighter codebase, leverage LSP infrastructure
- But adds Python dependency, slower startup

**Option C (Recommended): Hybrid approach**
- Native tools for basic operations (read, write, edit, bash, glob, grep)
- MCP client support for Serena and other code intelligence servers
- Optional built-in tree-sitter for lightweight repo mapping
- Users can choose their level of code intelligence

This matches what Claude Code does — basic native tools + MCP extensibility.

### Integration with BombaCode (TypeScript)

Since Serena is a Python MCP server and BombaCode is TypeScript:

```typescript
// BombaCode as MCP Client connecting to Serena
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Spawn Serena as a subprocess
const transport = new StdioClientTransport({
  command: "uvx",
  args: ["--from", "git+https://github.com/oraios/serena", "serena-mcp-server"]
});

const client = new Client({ name: "bombacode", version: "1.0.0" });
await client.connect(transport);

// Now BombaCode can call Serena's tools
const symbols = await client.callTool("find_symbol", {
  name: "authenticate",
  symbol_type: "function"
});
```

### Trade-off Summary

| Factor | Build from Scratch | Use Serena |
|--------|-------------------|------------|
| Engineering effort | 200-500+ hours | 1-2 hours setup |
| Language support | Manual per-language | 30+ out of box |
| Token efficiency | 0% (file-based) | ~70% savings |
| Semantic depth | Shallow (grep/AST) | Deep (LSP) |
| Dependencies | None | Python 3.11+, uv |
| Flexibility | Maximum | Limited to LSP capabilities |
| Runtime analysis | Possible | Static only |

---

## 14. MCP Integration (General)

### What is MCP?

Model Context Protocol is an open standard (JSON-RPC 2.0) for AI-tool integrations. Think "USB-C for AI." Serena (above) is one example; the ecosystem has 1,700+ servers.

### Architecture

```
AI Application (Host)
  → MCP Client(s)
    → MCP Server(s): Tools, Resources, Prompts
```

### BombaCode as MCP Host

BombaCode should be an MCP **host** (client), able to connect to any MCP server:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({ name: "bomba-tools", version: "1.0.0" });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_code",
      description: "Execute code in sandbox",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await executeInSandbox(request.params.arguments.code);
  return { content: [{ type: "text", text: result }] };
});
```

### Benefits for BombaCode

- Standardized tool integration
- Growing ecosystem (1,700+ servers)
- Tool discovery at runtime
- Used by Claude Code, OpenCode, Goose, and others

---

## 15. Hooks & Plugin System

### Hook Points

| Hook | Trigger | Use Case |
|------|---------|----------|
| PreToolUse | Before tool execution | Validation, blocking |
| PostToolUse | After tool execution | Logging, auditing |
| SessionStart | Session initialization | Setup, loading |
| SessionEnd | Session termination | Cleanup, saving |
| UserPromptSubmit | User message | Preprocessing |

### Plugin Architecture

Plugins bundle: slash commands + tools + hooks + MCP servers into installable units.

```yaml
# plugin.yaml
name: code-reviewer
version: 1.0.0
tools:
  - name: review_code
    handler: ./tools/review.ts
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      handler: ./hooks/audit.ts
mcp_servers:
  - name: eslint
    command: npx eslint-mcp-server
```

---

## 16. Competitive Analysis

### Feature Matrix

| Feature | Claude Code | Codex CLI | Aider | OpenCode | Goose |
|---------|------------|-----------|-------|----------|-------|
| Language | TypeScript | TypeScript | Python | Go + JS | Rust |
| Multi-model | Claude only | OpenAI only | 20+ models | 8+ providers | Any LLM |
| Edit approach | String-match | Unified diff | Multiple formats | File write | MCP-based |
| Multi-agent | Sub-agents | SDK agents | No | Basic | MCP-based |
| Codebase index | Glob/Grep | Shell search | Tree-sitter + PageRank | SQLite | File search |
| Git integration | Good | Good | Excellent (auto-commit) | Basic | Good |
| Sandboxing | Seatbelt/bubblewrap | Landlock/seccomp | None | None | Container |
| Memory system | CLAUDE.md hierarchy | AGENTS.md | Chat history | SQLite sessions | Extension-based |
| MCP support | Yes | Yes | No | Yes | Native |
| Serena-compatible | Yes (via MCP) | No | No | Yes (via MCP) | Yes (via MCP) |
| LSP | Yes (Dec 2025) | No | No | Yes | No |
| Hooks/plugins | Yes (150+) | Basic | No | Plugins | Extensions |
| Context compaction | Auto at 95% | Prompt caching | Smart repo map | Auto summary | Pruning |

### SWE-Bench Verified Scores (Feb 2026)

| Model/Agent | Score |
|-------------|-------|
| Claude Opus 4.6 (Thinking) | 80.8% |
| Claude Sonnet 4.6 | 79.6% |
| Gemini 3 Flash | 76.2% |
| Codex 5.3 | 75.4% |

---

## 17. Recommended Architecture for BombaCode

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    BombaCode CLI                      │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Terminal  │  │ Command  │  │ Configuration    │  │
│  │ UI (Ink)  │  │ Parser   │  │ Manager          │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                  │             │
│  ┌────▼──────────────▼──────────────────▼──────────┐ │
│  │              Agent Loop Engine                    │ │
│  │  ┌─────────────────────────────────────────────┐ │ │
│  │  │  Message Manager (context, compaction)      │ │ │
│  │  │  Tool Router (execute, validate, sandbox)   │ │ │
│  │  │  Permission Manager (allow/deny/ask)        │ │ │
│  │  └─────────────────────────────────────────────┘ │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                             │
│  ┌──────────────────────▼──────────────────────────┐ │
│  │           LLM Provider Abstraction               │ │
│  │  ┌────────┐  ┌──────────┐  ┌─────────────────┐ │ │
│  │  │OpenAI  │  │Anthropic │  │ Local (Ollama)  │ │ │
│  │  │ SDK    │  │  SDK     │  │                 │ │ │
│  │  └───┬────┘  └────┬─────┘  └───────┬─────────┘ │ │
│  └──────┼─────────────┼───────────────┼────────────┘ │
│         │             │               │               │
│    OpenRouter     Direct API     LiteLLM Proxy       │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   Tool Layer                          │
│                                                       │
│  ┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │ Read   │ │Write │ │ Edit │ │ Bash │ │ Glob   │ │
│  └────────┘ └──────┘ └──────┘ └──────┘ └────────┘ │
│  ┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │ Grep   │ │ Task │ │ Web  │ │ Todo │ │  MCP   │ │
│  └────────┘ └──────┘ └──────┘ └──────┘ └───┬────┘ │
└─────────────────────────────────────────────┼───────┘
                                              │
┌─────────────────────────────────────────────▼───────┐
│             MCP Server Ecosystem                     │
│                                                       │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │ Serena   │  │ CodeGrok   │  │  Custom MCP      │ │
│  │ (LSP     │  │ (Semantic  │  │  Servers          │ │
│  │  Code    │  │  Search)   │  │  (User-added)    │ │
│  │  Intel)  │  │            │  │                   │ │
│  └──────────┘  └────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                 Persistence Layer                     │
│                                                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Sessions │  │  Memory   │  │  Settings        │ │
│  │ (.jsonl) │  │ (BOMBA.md)│  │  (.json)         │ │
│  └──────────┘  └───────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js + TypeScript | Rich ecosystem, LLM SDK support |
| Bundler | Bun or esbuild | Single-file distribution |
| Terminal UI | Ink (React for CLIs) | Rich, composable UI components |
| File editing | Unified diff primary | 3x better accuracy than string-match |
| Context mgmt | Sliding window + auto-compaction | Proven pattern from Claude Code |
| Search | Vendored ripgrep | Ultra-fast, cross-platform |
| Code parsing | Tree-sitter WASM | Language-aware symbol extraction |
| LLM gateway | OpenRouter primary | 500+ models, single API |
| Local models | LiteLLM proxy sidecar | Normalizes all providers |
| Session storage | JSONL files | Simple, appendable, debuggable |
| Project memory | BOMBA.md hierarchy | Persistent, version-controllable |
| Sandboxing | Platform-specific | Landlock (Linux), Seatbelt (macOS) |
| Extensions | MCP protocol | Industry standard, growing ecosystem |

---

## 18. Implementation Priorities

### Phase 1: Core Agent (Self-Hosting Target)

Get BombaCode functional enough to help build BombaCode itself.

1. **CLI scaffold** - TypeScript project, Ink terminal UI, command parsing
2. **LLM provider layer** - OpenRouter integration via OpenAI SDK
3. **Agent loop** - Message management, tool execution cycle
4. **Core tools** - Read, Write, Edit (string-match first), Bash, Glob, Grep
5. **Basic context management** - Token counting, simple truncation
6. **Session persistence** - Save/resume conversations
7. **BOMBA.md support** - Load project memory

### Phase 2: Production Quality

8. **Unified diff editing** - Higher accuracy file editing
9. **Auto-compaction** - Summarize conversation when context fills
10. **Permission system** - Allow/deny/ask rules
11. **Streaming** - Real-time output display
12. **Configuration** - Settings file, environment variables

### Phase 3: Advanced Features

13. **Multi-agent (Task tool)** - Sub-agent spawning
14. **Tree-sitter integration** - AST-aware codebase understanding
15. **Repository mapping** - Dependency graph + PageRank
16. **MCP support** - External tool integration
17. **LiteLLM integration** - Open source model support
18. **Hooks system** - Pre/post tool execution hooks

### Phase 4: Polish & Ecosystem

19. **Sandboxing** - Platform-specific security
20. **Plugin system** - Installable bundles
21. **LSP integration** - Semantic code navigation
22. **Git worktree support** - Parallel agent development
23. **Prompt caching** - Cost optimization
24. **Embedding-based search** - RAG for large codebases

---

## 19. Sources

### Official Documentation
- [Claude Code Architecture](https://code.claude.com/docs/en/how-claude-code-works)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Anthropic Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [OpenAI Codex CLI](https://github.com/openai/codex)
- [Aider Documentation](https://aider.chat/docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25)
- [OpenRouter API](https://openrouter.ai/docs/api/reference/overview)
- [LiteLLM Documentation](https://docs.litellm.ai/)

### Architecture Deep-Dives
- [Claude Code Internals - Medium](https://kotrotsos.medium.com/claude-code-internals-part-1-high-level-architecture)
- [Unrolling the Codex Agent Loop - OpenAI](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [How Claude Code is Built - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
- [OpenCode Internals - Moncef Abboud](https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/)
- [Building Effective Agents - Anthropic](https://www.anthropic.com/research/building-effective-agents)

### Context Management Research
- [Effective Context Engineering - Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Context Engineering for Coding Agents - Martin Fowler](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)
- [Aider Repository Map](https://aider.chat/2023/10/22/repomap.html)
- [Lost in the Middle - arXiv](https://arxiv.org/abs/2307.03172)

### Tool Design & Security
- [Code Surgery: AI File Edits](https://fabianhertwig.com/blog/coding-assistants-file-edits/)
- [Aider Edit Formats](https://aider.chat/docs/more/edit-formats.html)
- [Docker Sandboxes for Agents](https://www.docker.com/blog/docker-sandboxes-run-claude-code-and-other-coding-agents-unsupervised-but-safely/)
- [Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

### Multi-Agent Patterns
- [Task Tool Orchestration - DEV Community](https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2)
- [Git Worktrees for Parallel Agents](https://dev.to/arifszn/git-worktrees-the-power-behind-cursors-parallel-agents-19j1)
- [Agent-to-Agent Protocol (A2A) - Google](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

### Serena & MCP Code Intelligence
- [Serena GitHub Repository](https://github.com/oraios/serena)
- [Serena Documentation](https://oraios.github.io/serena/)
- [Serena Language Support](https://oraios.github.io/serena/01-about/020_programming-languages.html)
- [Serena Tools Reference](https://oraios.github.io/serena/01-about/035_tools.html)
- [Deconstructing Serena's Architecture - Medium](https://medium.com/@souradip1000/deconstructing-serenas-mcp-powered-semantic-code-understanding-architecture-75802515d116)
- [Claude Context (Vector DB Code Search)](https://github.com/zilliztech/claude-context)
- [Code Pathfinder MCP](https://codepathfinder.dev/mcp)
- [Tree-sitter vs LSP Explainer](https://lambdaland.org/posts/2026-01-21_tree-sitter_vs_lsp/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

### Academic Papers
- [SWE-Context-Bench](https://arxiv.org/abs/2602.08316) - Context learning benchmark
- [Git Context Controller](https://arxiv.org/abs/2508.00031) - Version control-inspired context
- [Active Context Compression](https://arxiv.org/abs/2601.07190) - Autonomous memory management
- [Memory-as-Action](https://arxiv.org/abs/2510.12635) - Learned context curation
- [cAST](https://arxiv.org/abs/2506.15655) - AST-based code chunking for RAG
- [RANGER](https://arxiv.org/abs/2509.25257) - Graph-enhanced code retrieval
- [Tokenomics](https://arxiv.org/abs/2601.14470) - Token consumption in agentic SE
