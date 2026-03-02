import { describe, expect, it } from "vitest";
import type { ToolResult } from "../../src/llm/types.js";
import {
  COLLAPSED_LINE_LIMIT,
  buildEditPreview,
  buildTextPreview,
  summarizeReadOutput,
} from "../../src/cli/components/ToolOutput.js";

describe("ToolOutput collapse helpers", () => {
  it("shows full short output without footer", () => {
    const preview = buildTextPreview("line1\nline2\nline3", "glob", false, false);

    expect(preview.visibleLines).toEqual(["line1", "line2", "line3"]);
    expect(preview.footer).toBeNull();
    expect(preview.isCollapsible).toBe(false);
  });

  it("collapses long glob output with header and expand hint", () => {
    const content = [
      "Found 8 files:",
      "a.ts",
      "b.ts",
      "c.ts",
      "d.ts",
      "e.ts",
      "f.ts",
      "g.ts",
      "h.ts",
    ].join("\n");

    const preview = buildTextPreview(content, "glob", false, false);

    expect(preview.headerLine).toBe("Found 8 files:");
    expect(preview.visibleLines).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]);
    expect(preview.footer).toBe("▸ 3 more items — Ctrl+O to expand");
  });

  it("collapses long grep output with header and item hint", () => {
    const content = [
      "Found matches in 7 files:",
      "a.ts",
      "b.ts",
      "c.ts",
      "d.ts",
      "e.ts",
      "f.ts",
      "g.ts",
    ].join("\n");

    const preview = buildTextPreview(content, "grep", false, false);

    expect(preview.headerLine).toBe("Found matches in 7 files:");
    expect(preview.visibleLines).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]);
    expect(preview.footer).toBe("▸ 2 more items — Ctrl+O to expand");
  });

  it("collapses long bash output with line hint", () => {
    const content = ["l1", "l2", "l3", "l4", "l5", "l6", "l7"].join("\n");

    const preview = buildTextPreview(content, "bash", false, false);

    expect(preview.visibleLines).toEqual(["l1", "l2", "l3", "l4", "l5"]);
    expect(preview.footer).toBe("▸ 2 more lines — Ctrl+O to expand");
  });

  it("shows all lines in expanded mode with collapse hint", () => {
    const content = ["l1", "l2", "l3", "l4", "l5", "l6"].join("\n");

    const preview = buildTextPreview(content, "bash", true, false);

    expect(preview.visibleLines).toEqual(["l1", "l2", "l3", "l4", "l5", "l6"]);
    expect(preview.footer).toBe("▾ Esc to collapse");
  });

  it("does not collapse errors", () => {
    const content = ["Error: failed", "details1", "details2", "details3", "details4", "details5", "details6"].join("\n");

    const preview = buildTextPreview(content, "grep", false, true);

    expect(preview.visibleLines.length).toBe(7);
    expect(preview.footer).toBeNull();
    expect(preview.isCollapsible).toBe(false);
  });

  it("read summary remains unchanged", () => {
    const readResult: ToolResult = {
      toolUseId: "tool-read-1",
      content: ["a", "b", "c", "d", "e", "f"].join("\n"),
      isError: false,
    };

    expect(summarizeReadOutput(readResult)).toBe("Read 6 lines");
  });

  it("edit preview respects collapsed and expanded modes", () => {
    const editResult: ToolResult = {
      toolUseId: "tool-edit-1",
      isError: false,
      content: [
        "Applied edit to /tmp/file.ts:",
        "- 3 lines removed",
        "- 4 lines added",
        "",
        "@@ -1,5 +1,7 @@",
        " line1",
        "-line2",
        "+line2a",
        "+line2b",
        " line3",
        " line4",
        "+line5",
      ].join("\n"),
    };

    const collapsed = buildEditPreview(editResult, false);
    expect(collapsed.diff).toContain("@@ -1,5 +1,7 @@");
    expect(collapsed.maxLines).toBe(COLLAPSED_LINE_LIMIT);
    expect(collapsed.footer).toBe("▸ 3 more lines — Ctrl+O to expand");

    const expanded = buildEditPreview(editResult, true);
    expect(expanded.maxLines).toBe(Infinity);
    expect(expanded.footer).toBe("▾ Esc to collapse");
  });
});
