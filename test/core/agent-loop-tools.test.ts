import { describe, expect, it } from "vitest";
import { AgentLoop } from "../../src/core/agent-loop.js";
import { MessageManager } from "../../src/core/message-manager.js";
import { CostTracker } from "../../src/llm/cost-tracker.js";
import { ToolRegistry } from "../../src/core/tool-registry.js";
import { ToolRouter } from "../../src/core/tool-router.js";
import { PermissionManager } from "../../src/core/permission-manager.js";
import { CheckpointManager } from "../../src/core/checkpoint-manager.js";
import { BaseTool } from "../../src/tools/base-tool.js";
import type { LLMProvider, LLMRequest, LLMResponse, StreamEvent } from "../../src/llm/types.js";

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
  mode: "normal" | "infinite" | "error";

  constructor(mode: "normal" | "infinite" | "error") {
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

function buildLoop(provider: LLMProvider, registry: ToolRegistry, maxTurns = 25): AgentLoop {
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
    maxTurns,
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
});
