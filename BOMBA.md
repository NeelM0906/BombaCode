# BombaCode Memory

## Mission
BombaCode is a terminal-native coding agent focused on fast, safe, and auditable code changes.

## Current Phase
Phases 1-5 complete. Core agent loop, all essential tools, full terminal UI with streaming, multi-line input, and slash command menu are production-ready.

## Architecture
- CLI: Commander.js + Ink/React terminal UI
- LLM: 3 providers (OpenRouter, Anthropic Direct, OpenAI-compat)
- Core: Agentic loop with tool execution, context compaction, session persistence
- Tools: read, write, edit, bash, glob, grep, todo, ask_user
- Security: Path validation, command filtering, 4-mode permission system

## Defaults
- Provider: OpenRouter
- Model: anthropic/claude-sonnet-4-6
- Cost mode: balanced
- Permissions: normal (ask-first for write/bash)
- Context compaction: 85% threshold, Haiku summarization

## Conventions
- All providers implement LLMProvider interface from src/llm/types.ts
- Tools implement Tool interface from src/tools/base-tool.ts
- Shared streaming utilities in src/llm/streaming.ts (withRetry, abortableSleep, etc.)
- Tests in test/ mirror src/ directory structure
- 169 tests across 28 files, all passing
