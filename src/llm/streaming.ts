export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }
    return /aborted|abort/i.test(error.message);
  }

  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String((error as Record<string, unknown>).name);
    return name === "AbortError";
  }

  return false;
}

export async function* withCancellation<T>(
  stream: AsyncIterable<T>,
  signal?: AbortSignal
): AsyncGenerator<T> {
  if (signal?.aborted) {
    return;
  }

  for await (const chunk of stream) {
    if (signal?.aborted) {
      return;
    }
    yield chunk;
  }
}

/**
 * Sleep that respects an AbortSignal — resolves early if aborted.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Retry a function with exponential backoff. Retries on 429 and 5xx errors.
 * Throws immediately on 401. Respects abort signals during both execution and delays.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (signal?.aborted || isAbortError(err)) {
        throw err;
      }

      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (err as { status?: number }).status;

      if (status === 401) {
        throw new Error("Invalid API key. Run `bomba init` to reconfigure.");
      }

      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (retryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        try {
          await abortableSleep(delay, signal);
        } catch {
          throw lastError;
        }
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("Max retries exceeded");
}
