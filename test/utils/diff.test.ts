import { describe, expect, it } from "vitest";
import { applyUnifiedDiff, countChanges, generateDiff } from "../../src/utils/diff.js";

describe("diff utils", () => {
  it("generates unified diffs", () => {
    const diff = generateDiff("a\nb", "a\nc", "file.ts");
    expect(diff).toContain("@@");
    expect(diff).toContain("-b");
    expect(diff).toContain("+c");
  });

  it("counts added and removed lines", () => {
    const counts = countChanges("a\nb\nc", "a\nx\ny\nc");
    expect(counts.removed).toBe(1);
    expect(counts.added).toBe(2);
  });

  it("handles empty files", () => {
    const counts = countChanges("", "hello");
    expect(counts.removed).toBe(0);
    expect(counts.added).toBe(1);
  });

  it("handles identical files", () => {
    const diff = generateDiff("same", "same", "same.ts");
    const counts = countChanges("same", "same");

    expect(diff).toContain("same.ts");
    expect(counts.added).toBe(0);
    expect(counts.removed).toBe(0);
  });

  it("applyUnifiedDiff is stubbed for phase 3", () => {
    expect(() => applyUnifiedDiff("a", "diff")).toThrow(/not implemented in Phase 2/);
  });
});
