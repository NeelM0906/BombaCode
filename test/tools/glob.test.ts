import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GlobTool } from "../../src/tools/glob.js";

describe("GlobTool", () => {
  it("matches files with a glob pattern", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-glob-"));

    try {
      await writeFile(join(dir, "a.ts"), "", "utf8");
      await writeFile(join(dir, "b.js"), "", "utf8");

      const tool = new GlobTool();
      const result = await tool.execute({ pattern: "**/*.ts", path: dir });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("a.ts");
      expect(result.content).not.toContain("b.js");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("respects path parameter", async () => {
    const root = await mkdtemp(join(process.cwd(), ".bomba-glob-"));
    const subA = join(root, "a");
    const subB = join(root, "b");

    try {
      await mkdir(subA, { recursive: true });
      await mkdir(subB, { recursive: true });
      await writeFile(join(subA, "only-a.ts"), "", "utf8");
      await writeFile(join(subB, "only-b.ts"), "", "utf8");

      const tool = new GlobTool();
      const result = await tool.execute({ pattern: "**/*.ts", path: join(root, "a") });

      expect(result.content).toContain("only-a.ts");
      expect(result.content).not.toContain("only-b.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("handles no matches gracefully", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-glob-"));

    try {
      const tool = new GlobTool();
      const result = await tool.execute({ pattern: "**/*.xyz", path: dir });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("No files found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("limits output to 1000 files", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-glob-"));

    try {
      const writes: Promise<void>[] = [];
      for (let i = 0; i < 1005; i += 1) {
        writes.push(writeFile(join(dir, `f-${i}.txt`), "", "utf8"));
      }
      await Promise.all(writes);

      const tool = new GlobTool();
      const result = await tool.execute({ pattern: "**/*.txt", path: dir });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("Showing first 1000");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
