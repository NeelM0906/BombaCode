import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { GlobTool } from "../../src/tools/glob.js";

describe("GlobTool", () => {
  it("finds files using glob pattern", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bomba-glob-"));
    await writeFile(join(dir, "a.ts"), "", "utf8");
    await writeFile(join(dir, "b.js"), "", "utf8");

    const previousCwd = process.cwd();
    process.chdir(dir);

    try {
      const tool = new GlobTool();
      const result = await tool.run({ pattern: "**/*.ts" });
      expect(result).toContain("a.ts");
      expect(result).not.toContain("b.js");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
