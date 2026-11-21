export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onFailure?: (error: unknown, attempt: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient failures up to `attempts` times with exponential backoff and jitter.
 * Non-retryable programming errors should still be caught by the caller's final handler.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      options.onFailure?.(error, attempt);
      if (attempt === attempts) break;
      const exponential = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * Math.max(1, exponential * 0.2));
      await sleep(Math.min(exponential + jitter, maxDelayMs));
    }
  }
  throw lastError;
}
