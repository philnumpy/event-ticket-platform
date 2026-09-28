import { BucketState, refillAndConsume, TokenBucketConfig } from './TokenBucketMath';
import { RateLimitResult, RateLimiter } from './RateLimiter';

/**
 * Single-process only — exists for tests, the same role every other
 * `InMemory*` class plays in this codebase. Atomic for the same reason
 * ShowSeat's tryTransition is: no `await` occurs between reading the
 * current bucket and writing the new one, so two "concurrent" callers in
 * the same Node process can never interleave mid-update.
 */
export class InMemoryTokenBucketRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(
    private readonly config: TokenBucketConfig,
    private readonly clock: () => number = Date.now,
  ) {}

  async tryConsume(key: string, cost = 1): Promise<RateLimitResult> {
    const { allowed, nextState } = refillAndConsume(
      this.buckets.get(key) ?? null,
      this.config,
      this.clock(),
      cost,
    );
    this.buckets.set(key, nextState);
    return { allowed, remainingTokens: nextState.tokens };
  }
}
