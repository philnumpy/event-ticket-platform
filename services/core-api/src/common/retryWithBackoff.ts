import { sleep } from '@etp/domain';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
}

/**
 * A distinct, complementary pattern to CircuitBreaker, not a duplicate of
 * it: retry handles a single transient blip by trying again shortly after;
 * a circuit breaker handles sustained failure by refusing to keep trying at
 * all. They compose by nesting — see BookingSagaService, where a handful of
 * quick retries run *inside* a circuit breaker's `execute()`, so a brief
 * network hiccup recovers on its own, while a genuinely down dependency
 * still trips the breaker instead of every caller separately retrying
 * against it forever.
 */
export async function withRetryBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < options.maxAttempts - 1) {
        const delay = Math.min(
          options.baseDelayMs * 2 ** attempt,
          options.maxDelayMs ?? Number.POSITIVE_INFINITY,
        );
        await sleepFn(delay);
      }
    }
  }
  throw lastError;
}
