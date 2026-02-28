import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { EditTool } from "../../src/tools/edit.js";

describe("EditTool", () => {
  it("replaces matched text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bomba-edit-"));
    const filePath = join(dir, "sample.txt");
    await writeFile(filePath, "alpha beta", "utf8");

    const tool = new EditTool();
    await tool.execute({ file_path: filePath, old_string: "beta", new_string: "gamma" });

    const next = await readFile(filePath, "utf8");
    expect(next).toBe("alpha gamma");
  });
});
