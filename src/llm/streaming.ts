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
