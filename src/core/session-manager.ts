import { randomUUID } from "node:crypto";
import { SessionStore } from "../memory/session-store.js";
import type { Message } from "../llm/types.js";

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export class SessionManager {
  private currentId: string;
  private createdAt: string;

  constructor(private readonly store = new SessionStore()) {
    this.currentId = randomUUID();
    this.createdAt = new Date().toISOString();
  }

  getCurrentId(): string {
    return this.currentId;
  }

  save(messages: Message[]): void {
    const now = new Date().toISOString();
    this.store.append({
      id: this.currentId,
      createdAt: this.createdAt,
      updatedAt: now,
      messages,
    });
  }

  getLast(): SessionRecord | undefined {
    return this.store.getLast();
  }

  getById(id: string): SessionRecord | undefined {
    return this.store.getById(id);
  }

  resume(id: string): Message[] | undefined {
    const session = this.store.getById(id);
    if (!session) {
      return undefined;
    }

    this.currentId = session.id;
    this.createdAt = session.createdAt;
    return session.messages;
  }

  continueLast(): Message[] | undefined {
    const session = this.store.getLast();
    if (!session) {
      return undefined;
    }

    this.currentId = session.id;
    this.createdAt = session.createdAt;
    return session.messages;
  }
}
