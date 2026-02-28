import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReadTool } from "../../src/tools/read.js";

describe("ReadTool", () => {
  it("reads a file with line numbers", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-read-"));
    const filePath = join(dir, "sample.ts");

    try {
      await writeFile(filePath, "one\ntwo\nthree", "utf8");

      const tool = new ReadTool(process.cwd());
      const result = await tool.execute({ file_path: filePath });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("1\tone");
      expect(result.content).toContain("3\tthree");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("supports offset and limit", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-read-"));
    const filePath = join(dir, "sample.ts");

    try {
      await writeFile(filePath, "a\nb\nc\nd\ne", "utf8");

      const tool = new ReadTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, offset: 2, limit: 2 });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("2\tb");
      expect(result.content).toContain("3\tc");
      expect(result.content).not.toContain("1\ta");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns error for missing file", async () => {
    const tool = new ReadTool(process.cwd());
    const result = await tool.execute({ file_path: "missing-file.ts" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("File not found");
  });

  it("detects binary files", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-read-"));
    const filePath = join(dir, "sample.bin");

    try {
      await writeFile(filePath, Buffer.from([0, 1, 2, 3, 4]));

      const tool = new ReadTool(process.cwd());
      const result = await tool.execute({ file_path: filePath });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("Binary file detected");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("truncates very long lines", async () => {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-read-"));
    const filePath = join(dir, "sample.txt");

    try {
      await writeFile(filePath, "x".repeat(2500), "utf8");

      const tool = new ReadTool(process.cwd());
      const result = await tool.execute({ file_path: filePath });

      expect(result.isError).toBe(false);
      expect(result.content).toContain("[truncated]");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
