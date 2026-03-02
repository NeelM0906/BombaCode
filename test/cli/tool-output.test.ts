import { describe, expect, it } from "vitest";
import type { ToolResult } from "../../src/llm/types.js";
import {
  COLLAPSED_LINE_LIMIT,
  buildEditPreview,
  buildFooter,
  buildTextPreview,
  splitToolContent,
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

  // ── H1 fix verification: empty-line handling ──

  it("counts only non-empty lines and hides remaining non-empty items (H1 fix)", () => {
    // Content with interspersed blank lines — the blank lines should be stripped
    // before computing visibleLines and hiddenCount.
    const content = [
      "line1",
      "",
      "line2",
      "",
      "line3",
      "",
      "line4",
      "",
      "line5",
      "",
      "line6",
      "",
      "line7",
    ].join("\n");

    const preview = buildTextPreview(content, "bash", false, false);

    // visibleLines should only contain non-empty lines (first 5)
    expect(preview.visibleLines).toEqual(["line1", "line2", "line3", "line4", "line5"]);
    // 7 non-empty total minus 5 visible = 2 hidden
    expect(preview.hiddenCount).toBe(2);
    expect(preview.isCollapsible).toBe(true);
    expect(preview.footer).toBe("▸ 2 more lines — Ctrl+O to expand");
  });

  // ── M3 fix verification: edit tool error rendering ──

  it("renders edit tool errors through buildTextPreview with all lines visible", () => {
    const errorContent = "Error: old_string not found in file\nTried to match: function foo()";

    const preview = buildTextPreview(errorContent, "edit", false, true);

    // When isError is true, all lines should be shown without collapsing
    expect(preview.visibleLines).toEqual([
      "Error: old_string not found in file",
      "Tried to match: function foo()",
    ]);
    expect(preview.hiddenCount).toBe(0);
    expect(preview.footer).toBeNull();
    expect(preview.isCollapsible).toBe(false);
  });

  // ── Edit tool with no diff (edge case) ──

  it("returns diff: null when edit content has no @@ marker", () => {
    const result: ToolResult = {
      toolUseId: "tool-edit-nodiff",
      content: "Applied edit to /tmp/file.ts:\n- 1 lines removed\n- 1 lines added",
      isError: false,
    };

    const preview = buildEditPreview(result, false);

    expect(preview.diff).toBeNull();
    expect(preview.summaryText).toBe(result.content);
    expect(preview.hiddenCount).toBe(0);
    expect(preview.footer).toBeNull();
  });

  // ── Boundary: exactly 5 non-empty lines ──

  it("does not collapse when content has exactly 5 non-empty lines", () => {
    const content = ["a", "b", "c", "d", "e"].join("\n");

    const preview = buildTextPreview(content, "bash", false, false);

    expect(preview.visibleLines).toEqual(["a", "b", "c", "d", "e"]);
    expect(preview.hiddenCount).toBe(0);
    expect(preview.isCollapsible).toBe(false);
    expect(preview.footer).toBeNull();
  });

  // ── Boundary: exactly 6 non-empty lines ──

  it("collapses when content has exactly 6 non-empty lines with hiddenCount 1", () => {
    const content = ["a", "b", "c", "d", "e", "f"].join("\n");

    const preview = buildTextPreview(content, "bash", false, false);

    expect(preview.visibleLines).toEqual(["a", "b", "c", "d", "e"]);
    expect(preview.hiddenCount).toBe(1);
    expect(preview.isCollapsible).toBe(true);
    expect(preview.footer).toBe("▸ 1 more lines — Ctrl+O to expand");
  });

  // ── Empty content ──

  it("handles empty string content gracefully", () => {
    const preview = buildTextPreview("", "bash", false, false);

    // Empty string splits into [""] which after filtering empty lines becomes []
    expect(preview.visibleLines).toEqual([]);
    expect(preview.hiddenCount).toBe(0);
    expect(preview.isCollapsible).toBe(false);
    expect(preview.footer).toBeNull();
  });

  // ── Single line content ──

  it("does not collapse single-line content", () => {
    const preview = buildTextPreview("only one line", "bash", false, false);

    expect(preview.visibleLines).toEqual(["only one line"]);
    expect(preview.hiddenCount).toBe(0);
    expect(preview.isCollapsible).toBe(false);
    expect(preview.footer).toBeNull();
  });

  // ── summarizeReadOutput with single newline ──

  it("reports 0 lines for a single newline (not 2)", () => {
    const result: ToolResult = {
      toolUseId: "tool-read-newline",
      content: "\n",
      isError: false,
    };

    expect(summarizeReadOutput(result)).toBe("Read 0 lines");
  });

  // ── summarizeReadOutput with empty string ──

  it("reports 0 lines for empty string", () => {
    const result: ToolResult = {
      toolUseId: "tool-read-empty",
      content: "",
      isError: false,
    };

    expect(summarizeReadOutput(result)).toBe("Read 0 lines");
  });

  // ── splitToolContent generic path filters empty lines ──

  it("filters empty lines from body in generic tool content", () => {
    const { headerLine, bodyLines } = splitToolContent("line1\n\nline2\n\nline3", "bash");

    expect(headerLine).toBeNull();
    // The 2 blank lines should be filtered out
    expect(bodyLines).toEqual(["line1", "line2", "line3"]);
    expect(bodyLines.length).toBe(3);
  });
});
