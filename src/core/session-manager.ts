import { SessionStore } from "../memory/session-store.js";
import type { Message } from "../llm/types.js";

export interface SessionRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export class SessionManager {
  constructor(private readonly store = new SessionStore()) {}

  save(session: SessionRecord): void {
    this.store.append(session);
  }

  getLast(): SessionRecord | undefined {
    return this.store.getLast();
  }

  getById(id: string): SessionRecord | undefined {
    return this.store.getById(id);
  }
}
