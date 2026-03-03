# BombaCode — Recommendations & Next Steps

## Current State Summary

Phases 1-5 complete. Core agent loop, 8 tools, 3 LLM providers, full terminal UI with streaming, multi-line input, slash command autocomplete, collapsible tool output, prompt caching, and cost tracking are production-ready. 196 tests passing.

---

## Tier 1: High Impact, Directly Improves Agent Quality — COMPLETED

### 1. Wire in the System Prompt Draft — DONE (36b53d3)
### 2. MCP Integration (Phase 6) — DONE (92bcc05)
### 3. Smart Model Router (Phase 7) — DONE (49fa2ce)
### 4. Observation Masking / Token Optimization — DONE (72ebaef)

---

## Tier 2: Important for Production Readiness — COMPLETED

### 5. Web Search + Web Fetch Tools — DONE (6332c7d)
- Tavily search via `@tavily/core`, Readability + Turndown fetch pipeline
- 20 tests (7 search + 13 fetch)

### 6. Sub-agent / Task Tool — DONE (ded9229, merged 2556b51)
- Auto-assigned tools based on task keywords, parallel execution, max depth 5
- 30 tests

### 7. Hook System Wiring — DONE (5f4f78f, merged 3ae59fb)
- Settings-based + programmatic config, 7 event types, auto-lint opt-in
- 20 tests

### 8. Codebase Intelligence — DONE (9a3b926)
- Aider-style 4-layer: tree-sitter → graph → PageRank → token-budgeted output
- Dynamic updates debounced every 5 edits, 1024-token default
- 49 tests

---

## Tier 3: Polish & Distribution

### 9. Unified Diff Apply
`applyUnifiedDiff` throws "not implemented". Needed for diff-format editing (3x accuracy improvement per research).

### 10. Slash Commands
Verify `/help`, `/model`, `/cost`, `/compact`, `/clear`, `/session` are registered and functional.

### 11. Distribution (Phase 12)
`npm publish` readiness, proper README with installation/usage docs, `npx bomba` working out of the box.

### 12. Self-hosting Test
Use BombaCode on itself as the ultimate validation.

---

## Recommended Priority Order

1. System prompt upgrade (quick win)
2. MCP integration (biggest capability unlock)
3. Observation masking (biggest token savings)
4. Smart model router (cost control)
5. Web search/fetch (agent capability)
