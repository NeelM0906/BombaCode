import { beforeEach, describe, expect, it } from "vitest";
import { MessageManager } from "../../src/core/message-manager.js";

describe("MessageManager", () => {
  let manager: MessageManager;

  beforeEach(() => {
    manager = new MessageManager();
  });

  it("tracks user and assistant messages", () => {
    manager.addUserMessage("hello");
    manager.addAssistantMessage("hi");

    expect(manager.getMessageCount()).toBe(2);
    expect(manager.getLastAssistantMessage()).toBe("hi");
    expect(manager.isPinned(0)).toBe(true);
  });

  it("clears messages and pins", () => {
    manager.addUserMessage("test");
    manager.clear();

    expect(manager.getMessages()).toEqual([]);
    expect(manager.isPinned(0)).toBe(false);
  });

  it("setMessages replaces state and keeps first message pinned", () => {
    manager.setMessages([
      { role: "user", content: "task" },
      { role: "assistant", content: "working" },
    ]);

    expect(manager.getMessageCount()).toBe(2);
    expect(manager.isPinned(0)).toBe(true);
  });

  it("truncate removes oldest non-pinned messages", () => {
    manager.addUserMessage("initial pinned task"); // index 0 pinned by default
    manager.addAssistantMessage("assistant 1");
    manager.addUserMessage("user 2");
    manager.addAssistantMessage("assistant 3");

    manager.pin(2); // pin a middle message

    const removed = manager.truncate(10);

    expect(removed.length).toBeGreaterThan(0);
    expect(manager.isPinned(0)).toBe(true);

    const remaining = manager.getMessages();
    expect(remaining.some((msg) => msg.role === "user" && msg.content === "initial pinned task")).toBe(true);
    expect(remaining.some((msg) => msg.role === "user" && msg.content === "user 2")).toBe(true);
  });

  it("truncate remaps pinned indices after removals", () => {
    manager.setMessages([
      { role: "user", content: "p0" },
      { role: "assistant", content: "drop me" },
      { role: "user", content: "keep me pinned" },
      { role: "assistant", content: "drop me too" },
    ]);
    manager.pin(2);

    const removed = manager.truncate(5);

    expect(removed.length).toBeGreaterThan(0);

    const remaining = manager.getMessages();
    const pinnedMessageIndex = remaining.findIndex(
      (msg) => msg.role === "user" && msg.content === "keep me pinned"
    );

    expect(pinnedMessageIndex).toBeGreaterThanOrEqual(0);
    expect(manager.isPinned(pinnedMessageIndex)).toBe(true);
  });

  it("summarize replaces a message range with context summary", () => {
    manager.setMessages([
      { role: "user", content: "task" },
      { role: "assistant", content: "turn 1" },
      { role: "user", content: "turn 2" },
      { role: "assistant", content: "turn 3" },
    ]);

    manager.summarize(1, 2, "summarized middle turns");

    expect(manager.getMessages()).toEqual([
      { role: "user", content: "task" },
      { role: "user", content: "[Context summary]: summarized middle turns" },
      { role: "assistant", content: "turn 3" },
    ]);
    expect(manager.isPinned(0)).toBe(true);
  });

  it("getEstimatedTokensForRange estimates inclusive ranges", () => {
    manager.setMessages([
      { role: "user", content: "first message" },
      { role: "assistant", content: "second message" },
      { role: "user", content: "third message" },
    ]);

    const rangeTokens = manager.getEstimatedTokensForRange(0, 1);
    const fullTokens = manager.getEstimatedTokens();

    expect(rangeTokens).toBeGreaterThan(0);
    expect(rangeTokens).toBeLessThan(fullTokens);
  });

  it("throws on invalid pin/summarize/range calls", () => {
    manager.setMessages([{ role: "user", content: "one" }]);

    expect(() => manager.pin(2)).toThrow("out of bounds");
    expect(() => manager.summarize(0, 3, "bad")).toThrow("out of bounds");
    expect(() => manager.getEstimatedTokensForRange(0, 2)).toThrow("out of bounds");
  });
});
