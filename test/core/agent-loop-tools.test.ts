import { describe, expect, it, vi } from "vitest";
import { AgentLoop } from "../../src/core/agent-loop.js";
import { MessageManager } from "../../src/core/message-manager.js";
import { CostTracker } from "../../src/llm/cost-tracker.js";
import { ToolRegistry } from "../../src/core/tool-registry.js";
import { ToolRouter } from "../../src/core/tool-router.js";
import { PermissionManager } from "../../src/core/permission-manager.js";
import { CheckpointManager } from "../../src/core/checkpoint-manager.js";
import { BaseTool } from "../../src/tools/base-tool.js";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent } from "../../src/llm/types.js";
import type { ContextManager } from "../../src/core/context-manager.js";

class ReadFixtureTool extends BaseTool {
  name = "read";
  description = "read fixture";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: { file_path: { type: "string" } } };

  async run() {
    return { content: "1\tfixture line", isError: false };
  }
}

class ThrowTool extends BaseTool {
  name = "throw_tool";
  description = "throws";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };

  async run() {
    throw new Error("tool failed");
  }
}

class MockProvider implements LLMProvider {
  name = "mock";
  calls = 0;
  mode: "normal" | "infinite" | "error" | "max_tokens" | "max_tokens_forever";

  constructor(mode: "normal" | "infinite" | "error" | "max_tokens" | "max_tokens_forever") {
    this.mode = mode;
  }

  supportsTools(): boolean {
    return true;
  }

  supportsThinking(): boolean {
    return false;
  }

  supportsCaching(): boolean {
    return false;
  }

  estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async createMessage(_request: LLMRequest): Promise<LLMResponse> {
    return {
      content: "",
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async *streamMessage(_request: LLMRequest): AsyncGenerator<StreamEvent> {
    this.calls += 1;

    if (this.mode === "normal") {
      if (this.calls === 1) {
        yield { type: "text_delta", content: "I will read the file." };
        yield { type: "tool_call_start", toolCall: { id: "tc_1", name: "read" } };
        yield { type: "tool_call_end", toolCall: { id: "tc_1", name: "read", input: { file_path: "x" } } };
        yield { type: "done", stopReason: "tool_use" };
        return;
      }

      yield { type: "text_delta", content: "Read complete." };
      yield { type: "done", stopReason: "end_turn" };
      return;
    }

    if (this.mode === "infinite") {
      yield { type: "tool_call_start", toolCall: { id: `tc_${this.calls}`, name: "read" } };
      yield {
        type: "tool_call_end",
        toolCall: { id: `tc_${this.calls}`, name: "read", input: { file_path: "x" } },
      };
      yield { type: "done", stopReason: "tool_use" };
      return;
    }

    if (this.mode === "max_tokens") {
      if (this.calls === 1) {
        yield { type: "text_delta", content: "Partial answer..." };
        yield { type: "done", stopReason: "max_tokens" };
        return;
      }

      yield { type: "text_delta", content: "Completed after compaction." };
      yield { type: "done", stopReason: "end_turn" };
      return;
    }

    if (this.mode === "max_tokens_forever") {
      yield { type: "text_delta", content: "Still too long..." };
      yield { type: "done", stopReason: "max_tokens" };
      return;
    }

    if (this.calls === 1) {
      yield { type: "tool_call_start", toolCall: { id: "tc_err", name: "throw_tool" } };
      yield { type: "tool_call_end", toolCall: { id: "tc_err", name: "throw_tool", input: {} } };
      yield { type: "done", stopReason: "tool_use" };
      return;
    }

    yield { type: "text_delta", content: "Handled tool failure." };
    yield { type: "done", stopReason: "end_turn" };
  }

  getMaxContextTokens(): number {
    return 128_000;
  }
}

function buildLoop(
  provider: LLMProvider,
  registry: ToolRegistry,
  maxTurns = 25,
  contextManager?: ContextManager,
  onStreamEnd?: (fullResponse: string) => void
): AgentLoop {
  const router = new ToolRouter({
    registry,
    permissionManager: new PermissionManager("normal"),
    checkpointManager: new CheckpointManager(),
  });

  return new AgentLoop({
    messageManager: new MessageManager(),
    provider,
    costTracker: new CostTracker(),
    model: "anthropic/claude-sonnet-4-6",
    toolRegistry: registry,
    toolRouter: router,
    contextManager,
    maxTurns,
    onStreamEnd,
  });
}

describe("AgentLoop tool integration", () => {
  it("processes tool calls across loop iterations", async () => {
    const provider = new MockProvider("normal");
    const registry = new ToolRegistry();
    registry.register(new ReadFixtureTool());

    const loop = buildLoop(provider, registry);
    const response = await loop.processUserInput("Read fixture");

    expect(provider.calls).toBe(2);
    expect(response).toContain("Read complete");
  });

  it("respects max turns safety limit", async () => {
    const provider = new MockProvider("infinite");
    const registry = new ToolRegistry();
    registry.register(new ReadFixtureTool());

    const loop = buildLoop(provider, registry, 3);
    const response = await loop.processUserInput("loop forever");

    expect(provider.calls).toBe(3);
    expect(response).toContain("maximum turns limit");
  });

  it("continues after tool errors", async () => {
    const provider = new MockProvider("error");
    const registry = new ToolRegistry();
    registry.register(new ThrowTool());

    const loop = buildLoop(provider, registry);
    const response = await loop.processUserInput("trigger tool error");

    expect(provider.calls).toBe(2);
    expect(response).toContain("Handled tool failure");
  });

  it("runs context budget check before each turn", async () => {
    const provider = new MockProvider("normal");
    const registry = new ToolRegistry();
    registry.register(new ReadFixtureTool());

    const ensureWithinBudget = vi.fn().mockResolvedValue(undefined);
    const compact = vi.fn().mockResolvedValue(undefined);
    const contextManager = { ensureWithinBudget, compact } as unknown as ContextManager;

    const loop = buildLoop(provider, registry, 25, contextManager);
    await loop.processUserInput("Read fixture");

    expect(ensureWithinBudget).toHaveBeenCalledTimes(2);
    expect(compact).not.toHaveBeenCalled();
  });

  it("compacts and retries when stream ends with max_tokens", async () => {
    const provider = new MockProvider("max_tokens");
    const registry = new ToolRegistry();
    registry.register(new ReadFixtureTool());

    const ensureWithinBudget = vi.fn().mockResolvedValue(undefined);
    const compact = vi.fn().mockResolvedValue(undefined);
    const contextManager = { ensureWithinBudget, compact } as unknown as ContextManager;

    const loop = buildLoop(provider, registry, 25, contextManager);
    const response = await loop.processUserInput("trigger max tokens");

    expect(compact).toHaveBeenCalledTimes(1);
    expect(provider.calls).toBe(2);
    expect(response).toContain("Completed after compaction");
  });

  it("stops after repeated max_tokens to prevent infinite retry loops", async () => {
    const provider = new MockProvider("max_tokens_forever");
    const registry = new ToolRegistry();
    registry.register(new ReadFixtureTool());

    const ensureWithinBudget = vi.fn().mockResolvedValue(undefined);
    const compact = vi.fn().mockResolvedValue(undefined);
    const contextManager = { ensureWithinBudget, compact } as unknown as ContextManager;

    const loop = buildLoop(provider, registry, 25, contextManager);
    const response = await loop.processUserInput("trigger repeated max tokens");

    expect(compact).toHaveBeenCalledTimes(1);
    expect(provider.calls).toBe(2);
    expect(response).toContain("Stopping to avoid an infinite retry loop");
  });

  it("emits cumulative response payloads through onStreamEnd", async () => {
    const provider = new MockProvider("normal");
    const registry = new ToolRegistry();
    registry.register(new ReadFixtureTool());
    const snapshots: string[] = [];

    const loop = buildLoop(provider, registry, 25, undefined, (fullResponse) => {
      snapshots.push(fullResponse);
    });

    const finalResponse = await loop.processUserInput("Read fixture");

    expect(snapshots.length).toBe(2);
    expect(snapshots[0]?.includes("I will read the file.")).toBe(true);
    expect(snapshots[1]).toBe(finalResponse);
    expect((snapshots[1] ?? "").length).toBeGreaterThan((snapshots[0] ?? "").length);
  });
});
