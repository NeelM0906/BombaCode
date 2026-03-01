import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../src/core/tool-registry.js";
import { ToolRouter } from "../../src/core/tool-router.js";
import { PermissionManager } from "../../src/core/permission-manager.js";
import { CheckpointManager } from "../../src/core/checkpoint-manager.js";
import { BaseTool } from "../../src/tools/base-tool.js";
import type { ToolInput } from "../../src/tools/base-tool.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ReadLikeTool extends BaseTool {
  name = "dummy_read";
  description = "readonly tool";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };

  async run() {
    return { content: "ok", isError: false };
  }
}

class ThrowingTool extends BaseTool {
  name = "dummy_throw";
  description = "throws";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };

  async run() {
    throw new Error("boom");
  }
}

class WriteLikeTool extends BaseTool {
  name = "dummy_write";
  description = "write tool";
  category = "write" as const;
  inputSchema = { type: "object", properties: { file_path: { type: "string" } } };

  async run() {
    return { content: "write done", isError: false };
  }
}

class ConcurrencyProbeReadTool extends BaseTool {
  name = "probe_read";
  description = "probe readonly concurrency";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: { delayMs: { type: "number" } } };

  constructor(private readonly state: { active: number; maxActive: number }) {
    super();
  }

  async run(input: ToolInput) {
    this.state.active += 1;
    this.state.maxActive = Math.max(this.state.maxActive, this.state.active);

    const delayMs = typeof input.delayMs === "number" ? input.delayMs : 0;
    await sleep(delayMs);

    this.state.active -= 1;
    return { content: `delayed ${delayMs}`, isError: false };
  }
}

class ConcurrencyProbeWriteTool extends BaseTool {
  name = "probe_write";
  description = "probe write concurrency";
  category = "write" as const;
  inputSchema = { type: "object", properties: { delayMs: { type: "number" } } };

  constructor(private readonly state: { active: number; maxActive: number }) {
    super();
  }

  async run(input: ToolInput) {
    this.state.active += 1;
    this.state.maxActive = Math.max(this.state.maxActive, this.state.active);

    const delayMs = typeof input.delayMs === "number" ? input.delayMs : 0;
    await sleep(delayMs);

    this.state.active -= 1;
    return { content: `delayed ${delayMs}`, isError: false };
  }
}

class OutputTool extends BaseTool {
  name = "output";
  description = "returns provided content";
  category = "readonly" as const;
  inputSchema = {
    type: "object",
    properties: {
      content: { type: "string" },
    },
  };

  async run(input: ToolInput) {
    const content = typeof input.content === "string" ? input.content : "";
    return { content, isError: false };
  }
}

describe("ToolRouter", () => {
  it("executes tool calls", async () => {
    const registry = new ToolRegistry();
    registry.register(new ReadLikeTool());

    const permissionManager = new PermissionManager("normal");
    const checkpointManager = new CheckpointManager();
    const router = new ToolRouter({ registry, permissionManager, checkpointManager });

    const [result] = await router.executeToolCalls([{ id: "1", name: "dummy_read", input: {} }]);

    expect(result?.isError).toBe(false);
    expect(result?.content).toContain("ok");
  });

  it("handles unknown tools", async () => {
    const router = new ToolRouter({
      registry: new ToolRegistry(),
      permissionManager: new PermissionManager("normal"),
      checkpointManager: new CheckpointManager(),
    });

    const [result] = await router.executeToolCalls([{ id: "1", name: "missing_tool", input: {} }]);

    expect(result?.isError).toBe(true);
    expect(result?.content).toContain("Unknown tool");
  });

  it("returns error results when tool execution throws", async () => {
    const registry = new ToolRegistry();
    registry.register(new ThrowingTool());

    const router = new ToolRouter({
      registry,
      permissionManager: new PermissionManager("normal"),
      checkpointManager: new CheckpointManager(),
    });

    const [result] = await router.executeToolCalls([{ id: "1", name: "dummy_throw", input: {} }]);

    expect(result?.isError).toBe(true);
    expect(result?.content).toContain("Error executing tool");
  });

  it("checks permissions before execution", async () => {
    const registry = new ToolRegistry();
    registry.register(new ReadLikeTool());
    const permissionManager = new PermissionManager("normal");
    const checkSpy = vi.spyOn(permissionManager, "check");

    const router = new ToolRouter({
      registry,
      permissionManager,
      checkpointManager: new CheckpointManager(),
    });

    await router.executeToolCalls([{ id: "1", name: "dummy_read", input: {} }]);

    expect(checkSpy).toHaveBeenCalledTimes(1);
  });

  it("creates checkpoints for write tools", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-router-"));
    const filePath = join(dir, "file.ts");

    try {
      await writeFile(filePath, "const x = 1;", "utf8");

      const registry = new ToolRegistry();
      registry.register(new WriteLikeTool());
      const checkpointManager = new CheckpointManager();
      const snapshotSpy = vi.spyOn(checkpointManager, "snapshot");

      const router = new ToolRouter({
        registry,
        permissionManager: new PermissionManager("yolo"),
        checkpointManager,
      });

      await router.executeToolCalls([{ id: "1", name: "dummy_write", input: { file_path: filePath } }]);

      expect(snapshotSpy).toHaveBeenCalledWith(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("executes readonly tool calls in parallel", async () => {
    const state = { active: 0, maxActive: 0 };
    const registry = new ToolRegistry();
    registry.register(new ConcurrencyProbeReadTool(state));

    const router = new ToolRouter({
      registry,
      permissionManager: new PermissionManager("yolo"),
      checkpointManager: new CheckpointManager(),
    });

    const start = Date.now();
    await router.executeToolCalls([
      { id: "1", name: "probe_read", input: { delayMs: 120 } },
      { id: "2", name: "probe_read", input: { delayMs: 120 } },
    ]);
    const duration = Date.now() - start;

    expect(state.maxActive).toBeGreaterThan(1);
    expect(duration).toBeLessThan(220);
  });

  it("executes write tool calls sequentially", async () => {
    const state = { active: 0, maxActive: 0 };
    const registry = new ToolRegistry();
    registry.register(new ConcurrencyProbeWriteTool(state));

    const router = new ToolRouter({
      registry,
      permissionManager: new PermissionManager("yolo"),
      checkpointManager: new CheckpointManager(),
    });

    await router.executeToolCalls([
      { id: "1", name: "probe_write", input: { delayMs: 60 } },
      { id: "2", name: "probe_write", input: { delayMs: 60 } },
    ]);

    expect(state.maxActive).toBe(1);
  });

  it("applies medium-tier truncation for moderate outputs", async () => {
    const registry = new ToolRegistry();
    registry.register(new OutputTool());

    const router = new ToolRouter({
      registry,
      permissionManager: new PermissionManager("normal"),
      checkpointManager: new CheckpointManager(),
    });

    const mediumOutput = Array.from({ length: 700 }, (_, index) => `medium_token_${index}`).join(" ");
    const [result] = await router.executeToolCalls([
      { id: "1", name: "output", input: { content: mediumOutput } },
    ]);

    expect(result?.content.length).toBeLessThan(mediumOutput.length);
    expect(result?.content).toContain("... [truncated");
  });

  it("applies large-tier head-tail formatting for very large outputs", async () => {
    const registry = new ToolRegistry();
    registry.register(new OutputTool());

    const router = new ToolRouter({
      registry,
      permissionManager: new PermissionManager("normal"),
      checkpointManager: new CheckpointManager(),
    });

    const largeOutput = Array.from({ length: 3_500 }, (_, index) => `large_token_${index}`).join(" ");
    const [result] = await router.executeToolCalls([
      { id: "1", name: "output", input: { content: largeOutput } },
    ]);

    expect(result?.content).toContain("... [truncated");
    expect(result?.content).toContain("large_token_0");
    expect(result?.content).toContain("large_token_3499");
  });
});
