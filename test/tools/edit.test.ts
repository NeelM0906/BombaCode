import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EditTool } from "../../src/tools/edit.js";

describe("EditTool", () => {
  async function withTempFile(content: string): Promise<{ dir: string; filePath: string }> {
    const dir = await mkdtemp(join(process.cwd(), ".bomba-edit-"));
    const filePath = join(dir, "sample.ts");
    await writeFile(filePath, content, "utf8");
    return { dir, filePath };
  }

  it("applies single-match replacement", async () => {
    const { dir, filePath } = await withTempFile("alpha beta");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, old_string: "beta", new_string: "gamma" });
      expect(result.isError).toBe(false);

      const updated = await readFile(filePath, "utf8");
      expect(updated).toBe("alpha gamma");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("errors when no matches are found", async () => {
    const { dir, filePath } = await withTempFile("const x = 1;");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, old_string: "missing", new_string: "value" });
      expect(result.isError).toBe(true);
      expect(result.content).toContain("not found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("errors for ambiguous multi-match when replace_all is false", async () => {
    const { dir, filePath } = await withTempFile("x\nx\nx");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, old_string: "x", new_string: "y" });
      expect(result.isError).toBe(true);
      expect(result.content).toContain("Found 3 matches");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("replaces all matches when replace_all is true", async () => {
    const { dir, filePath } = await withTempFile("x\nx\nx");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({
        file_path: filePath,
        old_string: "x",
        new_string: "y",
        replace_all: true,
      });
      expect(result.isError).toBe(false);

      const updated = await readFile(filePath, "utf8");
      expect(updated).toBe("y\ny\ny");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves indentation and whitespace", async () => {
    const original = "if (ok) {\n  return value;\n}\n";
    const { dir, filePath } = await withTempFile(original);
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({
        file_path: filePath,
        old_string: "  return value;",
        new_string: "  return nextValue;",
      });
      expect(result.isError).toBe(false);

      const updated = await readFile(filePath, "utf8");
      expect(updated).toBe("if (ok) {\n  return nextValue;\n}\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles multi-line old_string", async () => {
    const { dir, filePath } = await withTempFile("a\nb\nc\nd\n");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({
        file_path: filePath,
        old_string: "b\nc",
        new_string: "x\ny",
      });
      expect(result.isError).toBe(false);

      const updated = await readFile(filePath, "utf8");
      expect(updated).toContain("x\ny");
      expect(updated).not.toContain("b\nc");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("errors for empty old_string", async () => {
    const { dir, filePath } = await withTempFile("const x = 1;");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({ file_path: filePath, old_string: "", new_string: "x" });
      expect(result.isError).toBe(true);
      expect(result.content).toContain("cannot be empty");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("errors when old_string equals new_string", async () => {
    const { dir, filePath } = await withTempFile("const x = 1;");
    try {
      const tool = new EditTool(process.cwd());
      const result = await tool.execute({
        file_path: filePath,
        old_string: "const",
        new_string: "const",
      });
      expect(result.isError).toBe(true);
      expect(result.content).toContain("identical");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
