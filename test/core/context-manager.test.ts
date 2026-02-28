import { describe, expect, it } from "vitest";
import { ContextManager } from "../../src/core/context-manager.js";

describe("ContextManager", () => {
  it("requests compaction near threshold", () => {
    const manager = new ContextManager({ maxTokens: 1000, compactAt: 0.85 });
    expect(manager.shouldCompact(850)).toBe(true);
    expect(manager.shouldCompact(200)).toBe(false);
  });

  it("keeps recent messages when compacting", () => {
    const manager = new ContextManager({ maxTokens: 1000, compactAt: 0.85 });
    const messages = Array.from({ length: 30 }, (_, index) => ({
      role: "user" as const,
      content: `m-${index}`,
    }));

    const compacted = manager.compact(messages);
    expect(compacted).toHaveLength(20);
    expect(compacted[0]?.content).toBe("m-10");
  });
});
