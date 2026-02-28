import { describe, expect, it } from "vitest";
import { BashTool } from "../../src/tools/bash.js";

describe("BashTool", () => {
  it("executes a simple command", async () => {
    const tool = new BashTool(process.cwd());
    const result = await tool.execute({ command: "echo bomba" });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Exit code: 0");
    expect(result.content).toContain("bomba");
  });

  it("captures non-zero exit code", async () => {
    const tool = new BashTool(process.cwd());
    const result = await tool.execute({ command: "bash -lc 'exit 2'" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Exit code: 2");
  });

  it("handles command timeout", async () => {
    const tool = new BashTool(process.cwd());
    const result = await tool.execute({ command: "node -e \"setTimeout(()=>{},2000)\"", timeout: 200 });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");
  });

  it("maintains working directory across calls", async () => {
    const tool = new BashTool(process.cwd());
    await tool.execute({ command: "cd src" });
    const pwd = await tool.execute({ command: "pwd" });

    expect(pwd.content).toContain("/src");
  });

  it("truncates large output", async () => {
    const tool = new BashTool(process.cwd());
    const result = await tool.execute({
      command: "node -e \"process.stdout.write('x'.repeat(35000))\"",
    });

    expect(result.isError).toBe(false);
    expect(result.content).toContain("truncated");
  });

  it("combines stdout and stderr", async () => {
    const tool = new BashTool(process.cwd());
    const result = await tool.execute({
      command: "node -e \"console.log('out'); console.error('err');\"",
    });

    expect(result.content).toContain("out");
    expect(result.content).toContain("err");
  });
});
