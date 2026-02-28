import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GrepTool } from "../../src/tools/grep.js";

describe("GrepTool", () => {
  async function setupProject() {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-grep-"));
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "a.ts"), "const AgentLoop = 1;\nconst value = 2;", "utf8");
    await writeFile(join(dir, "src", "b.ts"), "const agentloop = 3;\nreturn agentloop;", "utf8");
    await writeFile(join(dir, "README.md"), "AgentLoop docs", "utf8");
    return dir;
  }

  it("finds matching files", async () => {
    const dir = await setupProject();
    try {
      const tool = new GrepTool();
      const result = await tool.execute({ pattern: "AgentLoop", path: dir, output_mode: "files_with_matches" });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("a.ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports case-insensitive search", async () => {
    const dir = await setupProject();
    try {
      const tool = new GrepTool();
      const result = await tool.execute({
        pattern: "agentloop",
        path: dir,
        output_mode: "files_with_matches",
        case_insensitive: true,
      });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("a.ts");
      expect(result.content).toContain("b.ts");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports count output mode", async () => {
    const dir = await setupProject();
    try {
      const tool = new GrepTool();
      const result = await tool.execute({ pattern: "agentloop", path: dir, output_mode: "count", case_insensitive: true });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("matches");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports content mode with context", async () => {
    const dir = await setupProject();
    try {
      const tool = new GrepTool();
      const result = await tool.execute({
        pattern: "value",
        path: dir,
        output_mode: "content",
        context: 1,
      });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("a.ts:2");
      expect(result.content).toContain("a.ts:1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to native mode when ripgrep is unavailable", async () => {
    const dir = await setupProject();
    const previousPath = process.env.PATH;

    try {
      process.env.PATH = "";
      const tool = new GrepTool();
      const result = await tool.execute({ pattern: "AgentLoop", path: dir, output_mode: "files_with_matches" });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("a.ts");
    } finally {
      process.env.PATH = previousPath;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
