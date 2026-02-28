import { describe, expect, it } from "vitest";
import { isAbortError, withCancellation, abortableSleep, withRetry } from "../../src/llm/streaming.js";

async function* asyncItems<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe("isAbortError", () => {
  it("detects AbortError by name", () => {
    const err = new DOMException("The operation was aborted", "AbortError");
    expect(isAbortError(err)).toBe(true);
  });

  it("detects abort by message pattern", () => {
    const err = new Error("Request aborted by user");
    expect(isAbortError(err)).toBe(true);
  });

  it("detects non-Error objects with AbortError name", () => {
    const err = { name: "AbortError", message: "aborted" };
    expect(isAbortError(err)).toBe(true);
  });

  it("returns false for non-abort errors", () => {
    expect(isAbortError(new Error("network timeout"))).toBe(false);
    expect(isAbortError(new Error("500 server error"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError("string error")).toBe(false);
  });
});

describe("withCancellation", () => {
  it("yields all items when signal is not aborted", async () => {
    const items: number[] = [];
    for await (const item of withCancellation(asyncItems([1, 2, 3]))) {
      items.push(item);
    }
    expect(items).toEqual([1, 2, 3]);
  });

  it("yields no items when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const items: number[] = [];
    for await (const item of withCancellation(asyncItems([1, 2, 3]), controller.signal)) {
      items.push(item);
    }
    expect(items).toEqual([]);
  });

  it("stops yielding when signal is aborted mid-stream", async () => {
    const controller = new AbortController();
    const items: number[] = [];

    for await (const item of withCancellation(asyncItems([1, 2, 3, 4, 5]), controller.signal)) {
      items.push(item);
      if (item === 2) {
        controller.abort();
      }
    }

    // Should get 1 and 2, then stop after abort
    expect(items).toEqual([1, 2]);
  });

  it("works with no signal provided", async () => {
    const items: number[] = [];
    for await (const item of withCancellation(asyncItems([10, 20]))) {
      items.push(item);
    }
    expect(items).toEqual([10, 20]);
  });
});

describe("abortableSleep", () => {
  it("resolves after the specified delay", async () => {
    const start = Date.now();
    await abortableSleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });

  it("rejects immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableSleep(5000, controller.signal)).rejects.toThrow();
  });

  it("rejects when signal is aborted during sleep", async () => {
    const controller = new AbortController();
    const sleepPromise = abortableSleep(5000, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await expect(sleepPromise).rejects.toThrow();
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(async () => "ok");
    expect(result).toBe("ok");
  });

  it("retries on 429 and succeeds", async () => {
    let attempt = 0;
    const result = await withRetry(async () => {
      attempt++;
      if (attempt === 1) {
        const err = new Error("rate limited") as Error & { status: number };
        err.status = 429;
        throw err;
      }
      return "recovered";
    }, undefined, 3);

    expect(result).toBe("recovered");
    expect(attempt).toBe(2);
  });

  it("throws immediately on 401", async () => {
    await expect(
      withRetry(async () => {
        const err = new Error("unauthorized") as Error & { status: number };
        err.status = 401;
        throw err;
      })
    ).rejects.toThrow("Invalid API key");
  });

  it("throws after max retries exhausted", async () => {
    await expect(
      withRetry(
        async () => {
          const err = new Error("overloaded") as Error & { status: number };
          err.status = 529;
          throw err;
        },
        undefined,
        0
      )
    ).rejects.toThrow("overloaded");
  });
});
