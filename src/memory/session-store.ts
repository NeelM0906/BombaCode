import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../utils/platform.js";
import type { SessionRecord } from "../core/session-manager.js";

const SESSIONS_DIR = join(getConfigDir(), "sessions");
const SESSIONS_FILE = join(SESSIONS_DIR, "sessions.jsonl");

function ensureStore(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export class SessionStore {
  append(session: SessionRecord): void {
    ensureStore();
    appendFileSync(SESSIONS_FILE, `${JSON.stringify(session)}\n`, "utf8");
  }

  getAll(): SessionRecord[] {
    ensureStore();
    if (!existsSync(SESSIONS_FILE)) {
      return [];
    }

    return readFileSync(SESSIONS_FILE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionRecord);
  }

  getLast(): SessionRecord | undefined {
    const all = this.getAll();
    return all.at(-1);
  }

  getById(id: string): SessionRecord | undefined {
    return this.getAll().find((session) => session.id === id);
  }
}
