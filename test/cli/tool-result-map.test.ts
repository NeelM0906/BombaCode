import { describe, expect, it } from "vitest";
import type { Message, ToolResult } from "../../src/llm/types.js";
import { buildToolResultMap } from "../../src/cli/utils/tool-result-map.js";

describe("buildToolResultMap", () => {
  it("returns empty map when given empty messages and no toolResults", () => {
    const result = buildToolResultMap([], undefined);

    expect(result.size).toBe(0);
  });

  it("returns empty map when given empty messages and empty toolResults", () => {
    const result = buildToolResultMap([], new Map());

    expect(result.size).toBe(0);
  });

  it("returns same map when only live toolResults are provided (no historical messages)", () => {
    const liveResults = new Map<string, ToolResult>([
      [
        "tool-1",
        { toolUseId: "tool-1", content: "file contents here", isError: false },
      ],
      [
        "tool-2",
        { toolUseId: "tool-2", content: "grep results", isError: false },
      ],
    ]);

    const result = buildToolResultMap([], liveResults);

    expect(result.size).toBe(2);
    expect(result.get("tool-1")).toEqual(liveResults.get("tool-1"));
    expect(result.get("tool-2")).toEqual(liveResults.get("tool-2"));
  });

  it("reconstructs ToolResults from historical tool messages with isError heuristic", () => {
    const messages: Message[] = [
      { role: "user", content: "read file.ts" },
      {
        role: "assistant",
        content: "I will read the file.",
        toolCalls: [{ id: "tool-1", name: "read", input: { file_path: "file.ts" } }],
      },
      { role: "tool", toolUseId: "tool-1", content: "const x = 1;" },
      {
        role: "assistant",
        content: "I will read another file.",
        toolCalls: [{ id: "tool-2", name: "read", input: { file_path: "missing.ts" } }],
      },
      { role: "tool", toolUseId: "tool-2", content: "Error: file not found" },
    ];

    const result = buildToolResultMap(messages);

    expect(result.size).toBe(2);

    const first = result.get("tool-1");
    expect(first).toBeDefined();
    expect(first!.content).toBe("const x = 1;");
    expect(first!.isError).toBe(false);

    const second = result.get("tool-2");
    expect(second).toBeDefined();
    expect(second!.content).toBe("Error: file not found");
    expect(second!.isError).toBe(true);
  });

  it("gives live results precedence over historical tool messages", () => {
    const liveResults = new Map<string, ToolResult>([
      [
        "tool-1",
        { toolUseId: "tool-1", content: "live content", isError: false },
      ],
    ]);

    const messages: Message[] = [
      {
        role: "tool",
        toolUseId: "tool-1",
        content: "Error: stale historical content",
      },
    ];

    const result = buildToolResultMap(messages, liveResults);

    expect(result.size).toBe(1);

    const entry = result.get("tool-1");
    expect(entry).toBeDefined();
    // The live result should win — content should be "live content", not the historical error
    expect(entry!.content).toBe("live content");
    expect(entry!.isError).toBe(false);
  });

  it("applies isError heuristic: content starting with 'Error:' is marked as error", () => {
    const messages: Message[] = [
      { role: "tool", toolUseId: "err-1", content: "Error: something went wrong" },
      { role: "tool", toolUseId: "ok-1", content: "All good, no errors" },
      { role: "tool", toolUseId: "err-2", content: "Error:" },
      { role: "tool", toolUseId: "ok-2", content: "error: lowercase does not match" },
    ];

    const result = buildToolResultMap(messages);

    expect(result.get("err-1")!.isError).toBe(true);
    expect(result.get("ok-1")!.isError).toBe(false);
    expect(result.get("err-2")!.isError).toBe(true);
    // "error:" with lowercase 'e' should NOT be detected as error by startsWith("Error:")
    expect(result.get("ok-2")!.isError).toBe(false);
  });

  it("skips non-tool messages (user and assistant) without affecting the result map", () => {
    const messages: Message[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "hi there",
        toolCalls: [{ id: "tool-1", name: "bash", input: { command: "ls" } }],
      },
      { role: "tool", toolUseId: "tool-1", content: "file1.ts\nfile2.ts" },
      { role: "user", content: "thanks" },
      { role: "assistant", content: "you're welcome" },
    ];

    const result = buildToolResultMap(messages);

    // Only the single tool message should produce an entry
    expect(result.size).toBe(1);
    expect(result.has("tool-1")).toBe(true);
    expect(result.get("tool-1")!.content).toBe("file1.ts\nfile2.ts");
    expect(result.get("tool-1")!.isError).toBe(false);
  });
});
