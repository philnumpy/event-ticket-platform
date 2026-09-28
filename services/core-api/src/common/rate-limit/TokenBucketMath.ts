export interface BucketState {
  tokens: number;
  lastRefillAt: number; // ms epoch
}

export interface TokenBucketConfig {
  capacity: number;
  refillTokensPerSecond: number;
}

export interface TokenBucketResult {
  allowed: boolean;
  nextState: BucketState;
}

/**
 * The token bucket algorithm itself, as a pure function with no Redis, no
 * Nest, no I/O — kept separate specifically so it's testable in complete
 * isolation, and so `InMemoryTokenBucketRateLimiter` (tests) and
 * `RedisTokenBucketRateLimiter`'s Lua script (production) are two
 * implementations of the *same* documented algorithm rather than two
 * independently-evolving pieces of logic that could quietly drift apart.
 *
 * Lazy refill: no background timer tops up buckets. Each call computes how
 * many tokens would have accumulated since `lastRefillAt` given the
 * configured rate, capped at `capacity`, then attempts to spend `cost`
 * tokens from that total. This is the standard technique for a token
 * bucket that doesn't need a scheduler running per key.
 */
export function refillAndConsume(
  state: BucketState | null,
  config: TokenBucketConfig,
  now: number,
  cost: number,
): TokenBucketResult {
  const current = state ?? { tokens: config.capacity, lastRefillAt: now };
  const elapsedSeconds = Math.max(0, (now - current.lastRefillAt) / 1000);
  const refilled = Math.min(config.capacity, current.tokens + elapsedSeconds * config.refillTokensPerSecond);

  if (refilled >= cost) {
    return { allowed: true, nextState: { tokens: refilled - cost, lastRefillAt: now } };
  }
  return { allowed: false, nextState: { tokens: refilled, lastRefillAt: now } };
}
