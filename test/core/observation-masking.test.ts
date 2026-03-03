import { describe, expect, it } from "vitest";
import { maskObservedToolResults } from "../../src/core/observation-masking.js";
import type { Message } from "../../src/llm/types.js";

const LONG_CONTENT = "x\n".repeat(150); // 300 chars, above MIN_MASK_CONTENT_LENGTH

describe("maskObservedToolResults", () => {
  it("returns empty array for empty input", () => {
    expect(maskObservedToolResults([])).toEqual([]);
  });

  it("does not mask when there is no assistant message", () => {
    const messages: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "read", input: { file_path: "foo.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
    ];

    const result = maskObservedToolResults(messages);
    // The last message is a tool result with no subsequent assistant — not yet observed
    expect(result[2]!.content).toBe(LONG_CONTENT);
  });

  it("masks tool results that appear before the last assistant message", () => {
    const messages: Message[] = [
      { role: "user", content: "read foo.ts" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "read", input: { file_path: "src/foo.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "assistant", content: "Here is the file content." },
      { role: "user", content: "now edit it" },
    ];

    const result = maskObservedToolResults(messages);
    const toolMsg = result[2]!;
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.content).toMatch(/\[Previously read src\/foo\.ts — \d+ lines\]/);
    expect(toolMsg.content).not.toBe(LONG_CONTENT);
  });

  it("preserves tool results after the last assistant message", () => {
    const messages: Message[] = [
      { role: "user", content: "read foo.ts" },
      { role: "assistant", content: "Let me read that.", toolCalls: [{ id: "tc1", name: "read", input: { file_path: "a.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "assistant", content: "Done reading. Now running bash.", toolCalls: [{ id: "tc2", name: "bash", input: { command: "npm test" } }] },
      { role: "tool", toolUseId: "tc2", content: LONG_CONTENT },
    ];

    const result = maskObservedToolResults(messages);
    // tc1 should be masked (before last assistant at index 3)
    expect(result[2]!.content).toMatch(/\[Previously read/);
    // tc2 should NOT be masked (after last assistant at index 3)
    expect(result[4]!.content).toBe(LONG_CONTENT);
  });

  it("preserves message structure (role and toolUseId)", () => {
    const messages: Message[] = [
      { role: "user", content: "run test" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "bash", input: { command: "npm test" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "assistant", content: "Tests passed." },
    ];

    const result = maskObservedToolResults(messages);
    const toolMsg = result[2] as { role: string; toolUseId: string; content: string };
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.toolUseId).toBe("tc1");
    expect(toolMsg.content).toMatch(/\[Previously ran: npm test/);
  });

  it("generates correct placeholder for grep", () => {
    const grepResult = "file1.ts:10:match\nfile2.ts:20:match\nfile3.ts:30:match\n";
    const longGrepResult = grepResult.repeat(20); // make it long enough
    const messages: Message[] = [
      { role: "user", content: "search" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "grep", input: { pattern: "TODO" } }] },
      { role: "tool", toolUseId: "tc1", content: longGrepResult },
      { role: "assistant", content: "Found results." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toMatch(/\[Previously searched for "TODO" — \d+ matches\]/);
  });

  it("generates correct placeholder for write", () => {
    const messages: Message[] = [
      { role: "user", content: "create file" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "write", input: { file_path: "src/bar.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "assistant", content: "File created." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toMatch(/\[Previously wrote src\/bar\.ts — \d+ lines\]/);
  });

  it("generates correct placeholder for edit", () => {
    const messages: Message[] = [
      { role: "user", content: "edit file" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "edit", input: { file_path: "src/baz.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "assistant", content: "File edited." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toMatch(/\[Previously edited src\/baz\.ts\]/);
  });

  it("generates correct placeholder for glob", () => {
    const globResult = "src/a.ts\nsrc/b.ts\nsrc/c.ts\n".repeat(20);
    const messages: Message[] = [
      { role: "user", content: "find files" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "glob", input: { pattern: "**/*.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: globResult },
      { role: "assistant", content: "Found files." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toMatch(/\[Previously globbed "\*\*\/\*\.ts" — \d+ results\]/);
  });

  it("generates placeholder for MCP tools", () => {
    const messages: Message[] = [
      { role: "user", content: "use mcp" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "mcp_find_symbol", input: { name: "Foo" } }] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "assistant", content: "Found the symbol." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toMatch(/\[Previously called mcp_find_symbol — \d+ lines of output\]/);
  });

  it("does not mask short tool results", () => {
    const messages: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "", toolCalls: [{ id: "tc1", name: "read", input: { file_path: "small.ts" } }] },
      { role: "tool", toolUseId: "tc1", content: "short" },
      { role: "assistant", content: "File is short." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toBe("short");
  });

  it("handles multiple observed tool results", () => {
    const messages: Message[] = [
      { role: "user", content: "read two files" },
      { role: "assistant", content: "", toolCalls: [
        { id: "tc1", name: "read", input: { file_path: "a.ts" } },
        { id: "tc2", name: "read", input: { file_path: "b.ts" } },
      ] },
      { role: "tool", toolUseId: "tc1", content: LONG_CONTENT },
      { role: "tool", toolUseId: "tc2", content: LONG_CONTENT },
      { role: "assistant", content: "Both files read." },
    ];

    const result = maskObservedToolResults(messages);
    expect(result[2]!.content).toMatch(/\[Previously read a\.ts/);
    expect(result[3]!.content).toMatch(/\[Previously read b\.ts/);
  });
});
