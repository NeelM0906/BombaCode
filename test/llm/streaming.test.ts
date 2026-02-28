import { describe, expect, it } from "vitest";
import { isAbortError, withCancellation } from "../../src/llm/streaming.js";

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
