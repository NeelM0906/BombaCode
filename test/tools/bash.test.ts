import { describe, expect, it } from "vitest";
import { BashTool } from "../../src/tools/bash.js";

describe("BashTool", () => {
  it("runs a shell command", async () => {
    const tool = new BashTool();
    const result = await tool.execute({ command: "echo bomba" });
    expect(result.isError).toBe(false);
    expect(result.content).toContain("bomba");
  });
});
