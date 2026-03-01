# BombaCode

A terminal-native coding agent built from scratch with TypeScript. Think Claude Code / Codex, but open and extensible.

BombaCode connects to frontier LLMs (Claude, GPT, DeepSeek, Gemini) through OpenRouter, Anthropic Direct, or any OpenAI-compatible endpoint, and gives the model full access to read, write, edit files, run shell commands, search codebases, and manage tasks — all from your terminal.

## Quick Start

```bash
# Install dependencies and build
npm install && npm run build

# Run the setup wizard (first time)
node dist/index.js init

# Start chatting
node dist/index.js

# Or with an initial prompt
node dist/index.js "refactor the auth module to use JWT"
```

### Global Install

```bash
npm link
bomba              # interactive REPL
bomba init         # setup wizard
bomba "prompt"     # with initial prompt
bomba --continue   # resume last session
```

## Features

### Multi-Provider LLM Support

| Provider | Models | Setup |
|----------|--------|-------|
| **OpenRouter** | Claude, GPT, Gemini, DeepSeek, Llama | `OPENROUTER_API_KEY` |
| **Anthropic Direct** | Claude (with thinking + caching) | `ANTHROPIC_API_KEY` |
| **OpenAI-Compatible** | Any model via LiteLLM, Ollama, vLLM | Local endpoint, no key needed |

### 8 Built-in Tools

| Tool | What it does |
|------|-------------|
| `read` | Read files with line numbers, offset/limit, binary detection |
| `write` | Create/overwrite files with automatic directory creation |
| `edit` | String-match replacement with diff preview |
| `bash` | Shell execution with timeout, output truncation, dangerous command blocking |
| `glob` | Fast file pattern matching with .gitignore support |
| `grep` | Regex content search with context lines, file type filtering |
| `todo` | Task tracking with status management |
| `ask_user` | Interactive prompts with structured options |

### Interactive Terminal UI

- **Streaming responses** — character-by-character rendering as the model thinks
- **Multi-line input** — `Shift+Enter` or `Ctrl+J` for newlines
- **Slash command menu** — type `/` to see all commands with autocomplete
- **Permission prompts** — approve/deny tool actions inline
- **Session persistence** — resume conversations with `--continue`
- **Cost tracking** — real-time token count and dollar cost in the header

### Slash Commands

| Command | Description |
|---------|------------|
| `/help` | Show all available commands |
| `/clear` | Clear conversation state |
| `/cost` | Show session token/cost summary |
| `/tools` | List available tools |
| `/undo` | Restore last file checkpoint |
| `/mode <mode>` | Set permission mode |
| `/exit` | Exit BombaCode |

### Permission Modes

| Mode | Behavior |
|------|----------|
| `normal` | Ask before writes and shell commands (default) |
| `auto-edit` | Auto-approve file edits, ask for shell |
| `yolo` | Auto-approve everything (for containers/CI) |
| `plan` | Read-only — deny all writes |

### Context Management

BombaCode automatically manages the conversation context window:
- Tracks token budget against the model's context limit
- Auto-compacts old messages when approaching the threshold (default: 85%)
- Summarizes older conversation turns using a fast model (Haiku)
- Pins the initial task description so it's never dropped
- Handles `max_tokens` by compacting and retrying

## Configuration

Settings are stored at `~/.config/bombacode/settings.json`:

```jsonc
{
  "provider": "openrouter",           // "openrouter" | "anthropic" | "openai-compat"
  "apiKey": "sk-or-v1-...",           // or set via OPENROUTER_API_KEY env var
  "defaultModel": "anthropic/claude-sonnet-4-6",
  "models": {
    "fast": "anthropic/claude-haiku-4-5",
    "balanced": "anthropic/claude-sonnet-4-6",
    "powerful": "anthropic/claude-opus-4-6"
  },
  "costMode": "balanced",             // "quality-first" | "balanced" | "cost-first"
  "autoCompactAt": 0.85,              // compact at 85% of context window
  "permissions": {
    "mode": "normal",                  // "normal" | "auto-edit" | "yolo" | "plan"
    "customRules": []
  },
  "mcpServers": {}                     // MCP server configuration
}
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key (overrides settings) |
| `ANTHROPIC_API_KEY` | Anthropic direct API key (overrides settings) |

## CLI Reference

```
Usage: bomba [options] [prompt...]

Arguments:
  prompt                    Initial prompt to send

Options:
  --model <model>           Override default model
  -p, --provider <name>     Override provider (openrouter|openai-compat|anthropic)
  --mode <mode>             Permission mode (normal|auto-edit|yolo|plan)
  -c, --continue            Resume last session
  --resume <id>             Resume a specific session by ID
  --config                  Open settings in editor
  -V, --version             Show version
  -h, --help                Show help

Commands:
  init                      Run setup wizard
  mcp add <server>          Add MCP server
  mcp list                  List MCP servers
  mcp remove <server>       Remove MCP server
```

## Architecture

```
src/
  cli/                  # Terminal UI (Ink/React)
    components/         # InputBar, MessageList, Header, PermissionPrompt, SlashCommandMenu, etc.
    hooks/              # useMultiLineInput
    command-registry.ts # Slash command system
    app.tsx             # Main app component
  core/                 # Agent loop engine
    agent-loop.ts       # Stream -> tool call -> result -> repeat
    message-manager.ts  # Conversation management with pinning
    context-manager.ts  # Token budget and auto-compaction
    tool-router.ts      # Parallel readonly / sequential write execution
    tool-registry.ts    # Tool registration and discovery
    permission-manager.ts # 4-mode permission system
    session-manager.ts  # Save/resume sessions
    checkpoint-manager.ts # File snapshots for /undo
  llm/                  # LLM provider layer
    anthropic.ts        # Direct Claude API (thinking, caching)
    openrouter.ts       # OpenRouter multi-model
    openai-compat.ts    # Generic OpenAI-compatible
    streaming.ts        # Shared retry, cancellation, parsing
    cost-tracker.ts     # Token/dollar accounting
    token-counter.ts    # Tiktoken-based estimation
  tools/                # Built-in tool implementations
    read.ts, write.ts, edit.ts, bash.ts, glob.ts, grep.ts, todo.ts, ask-user.ts
  security/             # Path validation, command filtering, permission rules
  memory/               # Settings, session store, project memory (BOMBA.md)
  mcp/                  # MCP server integration (scaffolding)
  codebase/             # Repo intelligence (scaffolding)
  hooks/                # Hook system (scaffolding)
```

## Development

```bash
# Development mode (no build needed)
npm run dev

# Build
npm run build

# Run tests (169 tests, 28 files)
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

### Test Coverage

| Area | Tests |
|------|-------|
| LLM Providers (streaming, cost, tokens) | 38 |
| Core (agent loop, context, messages, permissions) | 37 |
| Tools (bash, edit, glob, grep, read, write) | 32 |
| CLI (commands, input, app) | 29 |
| Security (command filter, path validator) | 9 |
| Utilities | 5 |
| **Total** | **169** |

## Supported Models

### Via OpenRouter
- Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- GPT-5, GPT-4o, GPT-4o-mini, o3-mini
- Gemini 2.5 Pro, Gemini 2.0 Flash
- Llama 4 Maverick
- DeepSeek R1, DeepSeek Chat

### Via Anthropic Direct
- Claude Opus 4.6, Sonnet 4.6, Haiku 4.5
- Supports extended thinking and prompt caching

### Via OpenAI-Compatible
- Any model exposed through LiteLLM, Ollama, vLLM, or similar

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit message / execute slash command |
| `Shift+Enter` / `Ctrl+J` | Insert newline (multi-line input) |
| `Tab` | Insert selected slash command |
| `Up/Down` | Navigate slash command menu |
| `Escape` | Close menu / clear input |
| `Ctrl+C` | Abort running response / exit |
| `Ctrl+U` | Clear input line |
| `Ctrl+W` | Delete last word |

## Roadmap

- [ ] MCP server protocol integration
- [ ] Tree-sitter powered codebase intelligence
- [ ] Web search and fetch tools
- [ ] Advanced model routing based on task complexity
- [ ] Hook system for pre/post tool execution
- [ ] Sub-agent task spawning
- [ ] npm publish

## License

MIT
