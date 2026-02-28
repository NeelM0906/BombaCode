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
  });

  it("clears messages", () => {
    manager.addUserMessage("test");
    manager.clear();
    expect(manager.getMessages()).toEqual([]);
  });
});
