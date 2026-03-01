import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionRecord } from "../../src/core/session-manager.js";

var configDir = "";

vi.mock("../../src/utils/platform.js", () => ({
  getConfigDir: () => configDir || process.cwd(),
}));

import { SessionStore } from "../../src/memory/session-store.js";

function buildRecord(id: string, updatedAt: string, content: string): SessionRecord {
  return {
    id,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt,
    messages: [{ role: "user", content }],
  };
}

describe("SessionStore", () => {
  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), "bombacode-session-store-"));
  });

  afterEach(async () => {
    if (configDir) {
      await rm(configDir, { recursive: true, force: true });
      configDir = "";
    }
  });

  it("returns the most recent snapshot when multiple rows share an id", () => {
    const store = new SessionStore();

    store.append(buildRecord("session-1", "2026-03-01T00:01:00.000Z", "first snapshot"));
    store.append(buildRecord("session-2", "2026-03-01T00:02:00.000Z", "other session"));
    store.append(buildRecord("session-1", "2026-03-01T00:03:00.000Z", "latest snapshot"));

    const restored = store.getById("session-1");

    expect(restored?.updatedAt).toBe("2026-03-01T00:03:00.000Z");
    expect(restored?.messages[0]?.content).toBe("latest snapshot");
  });

  it("returns undefined when no matching session exists", () => {
    const store = new SessionStore();

    store.append(buildRecord("session-1", "2026-03-01T00:01:00.000Z", "first snapshot"));

    expect(store.getById("missing")).toBeUndefined();
  });
});
