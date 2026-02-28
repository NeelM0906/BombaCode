# Coding Agent Limitations & Enhancement Strategies
## Research Summary for BombaCode Development

---

## Critical Limitations We Must Solve

### 1. File Editing Accuracy (The #1 Problem)

**Current State:**
- Claude Code's string-match replacement: ~20-40% accuracy
- Aider unified diffs: ~61% accuracy
- Hash-line editing (Can Bölük): 6.7% → 68.3% (10x improvement)
- Morph semantic editing: 98% accuracy

**Root causes:** Whitespace sensitivity, stale file state, lazy code generation (LLMs skip code with comments like "// rest unchanged"), failure to match exact strings in long files.

**What BombaCode should do:**
- Primary: Unified diff format (proven 3x improvement)
- Support hash-line editing for additional accuracy
- Fallback: String-match for simple single-line changes
- Post-edit validation via parser/linter
- Consider Morph-style semantic editing for v2

### 2. Context Window: "Lost in the Middle"

**The problem:** 15-30% performance degradation for information in the middle of context. After reading 40+ files, agents forget patterns from early files. Token consumption is quadratic without caching.

**What BombaCode should do:**
- Place critical info at START and END of context
- Auto-compaction at 80-90% token usage
- Prompt caching for 90% cost reduction on stable content
- Sliding window with priority-based retention
- Summarize older turns rather than dropping them

### 3. Hallucination of APIs, Paths, and Names

**The problem:** Agents invent non-existent functions, reference wrong package versions, hallucinate file paths. "Slopsquatting" risk — generating calls to malicious look-alike packages.

**What BombaCode should do:**
- Verify file paths exist before editing
- Validate imports against actual installed packages
- Use Serena LSP for symbol verification
- Post-edit lint/typecheck cycle

### 4. Large Codebase Struggles (100K+ files)

**The problem:** Agents treat monorepos as expanded single files, missing layered dependencies. Custom decorators, subtle overrides across microservices remain invisible.

**What BombaCode should do:**
- Tree-sitter repo mapping with PageRank for file importance
- BOMBA.md files sprinkled through repo for agent guidance
- Serena MCP for symbol-level navigation
- Smart context selection (only load relevant files)

### 5. Multi-File Refactoring Failures

**The problem:** Renaming a function requires updating every call site, import, and test across potentially hundreds of files. Agents fail at maintaining consistency.

**What BombaCode should do:**
- Serena's `find_referencing_symbols` for impact analysis
- Multi-agent: Planner → Executor → Verifier pattern
- AST-aware edits that understand code structure
- Run full test suite after multi-file changes

### 6. No Runtime Understanding

**The problem:** Agents analyze static code only. They can't observe runtime behavior, caching, feature flags, or dynamic dispatch.

**What BombaCode should do:**
- Phase 1: Static analysis only (realistic for weekend)
- Phase 2: Debug integration (breakpoints, stack traces)
- Phase 3: Execution tracing for dynamic analysis

### 7. Stateless Sessions (No Learning)

**The problem:** Every session starts fresh. Agents don't learn from past mistakes, successful patterns, or project-specific conventions.

**What BombaCode should do:**
- BOMBA.md hierarchy for persistent project memory
- Session persistence (save/resume conversations)
- Phase 2: Episodic memory (remember past decisions)
- Phase 3: Learning from corrections (A-MEM pattern)

### 8. Cost Explosion at Scale

**The problem:** Without optimization, each agent turn replays all context. A 100-turn session can cost $50-100.

**What BombaCode should do:**
- Model routing: Haiku for simple, Sonnet for balanced, Opus for complex
- Prompt caching (90% cost reduction on cached content)
- Context compaction (summarize old turns)
- Plan caching (reuse plans for similar tasks)

### 9. Security and Sandboxing

**The problem:** CVE-2025-59536 in Claude Code enabled RCE through malicious repo config. Agents with filesystem access can damage systems.

**What BombaCode should do:**
- Permission system: deny → ask → allow
- Directory allowlists (no writing outside project)
- Command blocklists (no rm -rf /, no sudo)
- Network isolation options
- Phase 2: Landlock (Linux) / Seatbelt (macOS) integration

---

## Enterprise Enhancement Strategies (For Future Roadmap)

| Strategy | Impact | Implementation |
|----------|--------|----------------|
| Model routing | 46-70% cost reduction | Route by task complexity |
| Prompt caching | 90% on cached content | Cache system prompts, tools |
| Plan caching | 50% cost + 27% latency | Reuse plans for similar tasks |
| Model cascading | 87% cost reduction | Cheap first, escalate if needed |
| Air-gapped deployment | Enterprise requirement | Self-hosted LLM + local tools |
| Audit trails | Compliance requirement | Log all agent actions |
| SOC2/GDPR | Enterprise trust | Encryption, data residency |

---

## Concrete Implementations to Study

| Project | Innovation | Impact |
|---------|-----------|--------|
| Aider unified diffs | Diff format for editing | 3x accuracy improvement |
| Hash-line editing | Line hashing for context | 10x accuracy improvement |
| Morph semantic diff | AST-aware editing | 98% accuracy |
| Serena LSP | Symbol-level code intel | 70% token savings |
| RANGER | Graph-enhanced retrieval | Best on CodeSearchNet |
| A-MEM | Agentic memory framework | 26% quality improvement |
| Git Context Controller | Version-controlled memory | Better long-horizon tasks |
| claude-mem | Production memory plugin | 95% token compression |
| xRouter | RL-based model routing | 80-90% of GPT-5 at 20% cost |
| BitsAI-Fix | Lint error resolution | 84.8% fix accuracy |
| Debug2Fix | Interactive debugging | Runtime understanding |

---

## Sources

- [File editing problems | Aider](https://aider.chat/docs/troubleshooting/edit-errors.html)
- [Hash-line AI agents benchmark](https://abit.ee/en/artificial-intelligence/hashline-ai-agents-cursor-aider-claude-code)
- [AI Code Edit Formats Guide | Morph](https://www.morphllm.com/edit-formats)
- [Context Window Problem | Factory.ai](https://factory.ai/news/context-window-problem)
- [Docker Sandboxes for Agent Safety](https://www.docker.com/blog/docker-sandboxes-run-claude-code-and-other-coding-agents-unsupervised-but-safely/)
- [RefAgent Multi-agent Framework](https://arxiv.org/html/2511.03153v1)
- [SWE-bench](https://www.swebench.com/SWE-bench/)
- [Mem0: Production AI Agents](https://arxiv.org/pdf/2504.19413)
- [A-Mem: Agentic Memory](https://arxiv.org/pdf/2502.12110)
- [Git Context Controller](https://arxiv.org/abs/2508.00031)
- [xRouter: Cost-Aware LLM Routing](https://arxiv.org/abs/2510.08439)
- [Debug2Fix: Interactive Debugging](https://arxiv.org/html/2602.18571)
- [BitsAI-Fix: Lint Error Resolution](https://arxiv.org/abs/2508.03487)
