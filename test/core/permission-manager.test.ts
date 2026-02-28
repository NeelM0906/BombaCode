import { describe, expect, it } from "vitest";
import { PermissionManager } from "../../src/core/permission-manager.js";
import type { ToolCall } from "../../src/llm/types.js";
import type { Tool } from "../../src/tools/base-tool.js";

const readonlyTool: Tool = {
  name: "read",
  description: "read",
  inputSchema: {},
  category: "readonly",
  async execute() {
    return { content: "", isError: false };
  },
};

const writeTool: Tool = {
  name: "edit",
  description: "edit",
  inputSchema: {},
  category: "write",
  async execute() {
    return { content: "", isError: false };
  },
};

const bashTool: Tool = {
  name: "bash",
  description: "bash",
  inputSchema: {},
  category: "execute",
  async execute() {
    return { content: "", isError: false };
  },
};

function call(name: string, input: Record<string, unknown> = {}): ToolCall {
  return { id: "1", name, input };
}

describe("PermissionManager", () => {
  it("auto-allows readonly tools", async () => {
    const manager = new PermissionManager("normal");
    const decision = await manager.check(call("read"), readonlyTool);
    expect(decision).toBe("allowed");
  });

  it("asks for write tools in normal mode", async () => {
    const manager = new PermissionManager("normal");
    const decision = await manager.check(call("edit"), writeTool);
    expect(decision).toBe("ask");
  });

  it("allows everything in yolo mode", async () => {
    const manager = new PermissionManager("yolo");
    expect(await manager.check(call("edit"), writeTool)).toBe("allowed");
    expect(await manager.check(call("bash", { command: "rm -rf /" }), bashTool)).toBe("allowed");
  });

  it("denies write tools in plan mode", async () => {
    const manager = new PermissionManager("plan");
    expect(await manager.check(call("edit"), writeTool)).toBe("denied");
    expect(await manager.check(call("read"), readonlyTool)).toBe("allowed");
  });

  it("persists session allow list", async () => {
    const manager = new PermissionManager("normal");
    expect(await manager.check(call("bash", { command: "npm test" }), bashTool)).toBe("ask");

    manager.addSessionAllow("bash");
    expect(await manager.check(call("bash", { command: "npm test" }), bashTool)).toBe("allowed");
  });

  it("denies dangerous commands before allow rules", async () => {
    const manager = new PermissionManager("normal");
    const decision = await manager.check(call("bash", { command: "rm -rf /" }), bashTool);
    expect(decision).toBe("denied");
  });

  it("matches command patterns for deny rules", async () => {
    const manager = new PermissionManager("normal");
    const decision = await manager.check(call("bash", { command: "sudo rm -rf /tmp" }), bashTool);
    expect(decision).toBe("denied");
  });
});
