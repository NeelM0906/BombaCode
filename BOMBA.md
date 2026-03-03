# BombaCode Memory

## Mission
BombaCode is a terminal-native coding agent focused on fast, safe, and auditable code changes.

## Current Phase
Phases 1-8 complete. All core features, tools, MCP integration, codebase intelligence, hook system, and sub-agent support are implemented.

## Architecture
- CLI: Commander.js + Ink/React terminal UI
- LLM: 3 providers (OpenRouter, Anthropic Direct, OpenAI-compat)
- Core: Agentic loop with tool execution, context compaction, session persistence, observation masking
- Tools: read, write, edit, bash, glob, grep, todo, ask_user, web_search, web_fetch, task (sub-agent)
- MCP: Full client/server/adapter stack for external tool integration (e.g. Serena LSP)
- Codebase: Aider-style repo map (tree-sitter + PageRank + token-budgeted output)
- Hooks: 7 event types, settings-based + programmatic config, auto-lint opt-in
- Security: Path validation, command filtering, 4-mode permission system
- Model Router: Complexity estimation, budget-aware downgrade, fallback chain

## Defaults
- Provider: OpenRouter
- Model: anthropic/claude-sonnet-4-6
- Cost mode: balanced
- Permissions: normal (ask-first for write/bash)
- Context compaction: 85% threshold, Haiku summarization
- Repo map: enabled, 1024 tokens, refresh every 5 edits

## Conventions
- All providers implement LLMProvider interface from src/llm/types.ts
- Tools implement Tool interface from src/tools/base-tool.ts
- Shared streaming utilities in src/llm/streaming.ts (withRetry, abortableSleep, etc.)
- Tests in test/ mirror src/ directory structure
- 341 tests across 38 files, all passing
