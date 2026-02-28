import { describe, expect, it } from "vitest";
import { BashTool } from "../../src/tools/bash.js";

describe("BashTool", () => {
  it("runs a shell command", async () => {
    const tool = new BashTool();
    const output = await tool.run({ command: "echo bomba" });
    expect(output).toContain("bomba");
  });
});
