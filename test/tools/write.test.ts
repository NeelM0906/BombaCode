import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WriteTool } from "../../src/tools/write.js";

describe("WriteTool", () => {
  it("creates a new file with content", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-write-"));
    const filePath = join(dir, "hello.ts");

    try {
      const tool = new WriteTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, content: "export const x = 1;" });

      expect(result.isError).toBe(false);
      const content = await readFile(filePath, "utf8");
      expect(content).toBe("export const x = 1;");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates parent directories automatically", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-write-"));
    const filePath = join(dir, "nested", "deep", "file.ts");

    try {
      const tool = new WriteTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, content: "ok" });

      expect(result.isError).toBe(false);
      const content = await readFile(filePath, "utf8");
      expect(content).toBe("ok");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("overwrites existing files", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-write-"));
    const filePath = join(dir, "overwrite.ts");

    try {
      await writeFile(filePath, "old", "utf8");

      const tool = new WriteTool(process.cwd());
      await tool.execute({ file_path: filePath, content: "new" });

      const content = await readFile(filePath, "utf8");
      expect(content).toBe("new");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns line counts in success output", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-write-"));
    const filePath = join(dir, "lines.ts");

    try {
      const tool = new WriteTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, content: "a\nb\nc" });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("3 lines");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
