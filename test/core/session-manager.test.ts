import { describe, expect, it } from "vitest";
import { SessionManager, type SessionRecord } from "../../src/core/session-manager.js";
import type { Message } from "../../src/llm/types.js";

class MockSessionStore {
  private records: SessionRecord[] = [];

  append(session: SessionRecord): void {
    this.records.push(session);
  }

  getById(id: string): SessionRecord | undefined {
    return this.records.find((record) => record.id === id);
  }

  getLast(): SessionRecord | undefined {
    return this.records.at(-1);
  }

  getAll(): SessionRecord[] {
    return [...this.records];
  }
}

function message(content: string): Message {
  return { role: "user", content };
}

describe("SessionManager", () => {
  it("creates a session id and saves messages", () => {
    const store = new MockSessionStore();
    const manager = new SessionManager(store as any);

    const sessionId = manager.getCurrentId();
    expect(sessionId).toBeTruthy();

    manager.save([message("hello")]);

    const saved = store.getById(sessionId);
    expect(saved).toBeDefined();
    expect(saved?.messages).toEqual([message("hello")]);
    expect(saved?.id).toBe(sessionId);
    expect(saved?.createdAt).toBeTruthy();
    expect(saved?.updatedAt).toBeTruthy();
  });

  it("resumes a session by id", () => {
    const store = new MockSessionStore();
    store.append({
      id: "session-123",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
      messages: [message("from resume")],
    });

    const manager = new SessionManager(store as any);
    const messages = manager.resume("session-123");

    expect(messages).toEqual([message("from resume")]);
    expect(manager.getCurrentId()).toBe("session-123");
  });

  it("continues the last session", () => {
    const store = new MockSessionStore();
    store.append({
      id: "session-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
      messages: [message("first")],
    });
    store.append({
      id: "session-2",
      createdAt: "2026-01-01T01:00:00.000Z",
      updatedAt: "2026-01-01T01:10:00.000Z",
      messages: [message("last")],
    });

    const manager = new SessionManager(store as any);
    const messages = manager.continueLast();

    expect(messages).toEqual([message("last")]);
    expect(manager.getCurrentId()).toBe("session-2");
  });

  it("returns undefined when session is missing", () => {
    const store = new MockSessionStore();
    const manager = new SessionManager(store as any);

    expect(manager.resume("missing")).toBeUndefined();
    expect(manager.continueLast()).toBeUndefined();
  });
});
