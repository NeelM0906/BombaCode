import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../src/core/tool-registry.js";
import { ToolRouter } from "../../src/core/tool-router.js";
import { PermissionManager } from "../../src/core/permission-manager.js";
import { CheckpointManager } from "../../src/core/checkpoint-manager.js";
import { BaseTool } from "../../src/tools/base-tool.js";

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
        permissionManager: new PermissionManager("normal"),
        checkpointManager,
      });

      await router.executeToolCalls([{ id: "1", name: "dummy_write", input: { file_path: filePath } }]);

      expect(snapshotSpy).toHaveBeenCalledWith(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
