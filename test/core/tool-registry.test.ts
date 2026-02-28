import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tool-registry.js";
import { BaseTool } from "../../src/tools/base-tool.js";

class DummyTool extends BaseTool {
  name = "dummy";
  description = "dummy tool";
  category = "readonly" as const;
  inputSchema = { type: "object", properties: {} };

  async run() {
    return { content: "ok", isError: false };
  }
}

describe("ToolRegistry", () => {
  it("registers and retrieves tools", () => {
    const registry = new ToolRegistry();
    const tool = new DummyTool();

    registry.register(tool);

    expect(registry.getTool("dummy")).toBe(tool);
    expect(registry.hasTool("dummy")).toBe(true);
    expect(registry.getToolNames()).toEqual(["dummy"]);
  });

  it("generates tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register(new DummyTool());

    const definitions = registry.getToolDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]?.name).toBe("dummy");
  });

  it("rejects duplicate tool registration", () => {
    const registry = new ToolRegistry();
    registry.register(new DummyTool());

    expect(() => registry.register(new DummyTool())).toThrow(/already registered/);
  });

  it("supports unregister", () => {
    const registry = new ToolRegistry();
    registry.register(new DummyTool());

    registry.unregister("dummy");

    expect(registry.hasTool("dummy")).toBe(false);
  });
});
