import { refillAndConsume } from '../src/common/rate-limit/TokenBucketMath';
import { RedisTokenBucketRateLimiter } from '../src/common/rate-limit/RedisTokenBucketRateLimiter';

/**
 * The real TOKEN_BUCKET_SCRIPT Lua text can't be executed outside a real
 * Redis server, so it's unverified in this environment (same Docker
 * blocker as everything else — see the README). This test instead proves
 * the *wrapper*'s plumbing is correct: it calls `redis.eval` with the
 * arguments the script expects, in the order the script expects them, and
 * correctly parses the `[allowed, tokensString]` reply — by having the
 * fake `eval` implementation run the identical `refillAndConsume` function
 * the real script mirrors, on a Hash-shaped in-memory store, and asserting
 * the wrapper's parsed result matches what that computation produced.
 */
class FakeRedisWithEval {
  private readonly hashes = new Map<string, { tokens: string; ts: string }>();

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    capacity: number,
    refillRate: number,
    now: number,
    cost: number,
  ): Promise<[number, string]> {
    const existing = this.hashes.get(key);
    const state = existing
      ? { tokens: parseFloat(existing.tokens), lastRefillAt: parseFloat(existing.ts) }
      : null;

    const { allowed, nextState } = refillAndConsume(state, { capacity, refillTokensPerSecond: refillRate }, now, cost);
    this.hashes.set(key, { tokens: String(nextState.tokens), ts: String(nextState.lastRefillAt) });

    return [allowed ? 1 : 0, String(nextState.tokens)];
  }
}

describe('RedisTokenBucketRateLimiter', () => {
  it('allows a request when the bucket has capacity, and parses remainingTokens as a float', async () => {
    const redis = new FakeRedisWithEval();
    const limiter = new RedisTokenBucketRateLimiter(redis as never, { capacity: 10, refillTokensPerSecond: 5 });

    const result = await limiter.tryConsume('ip-1');

    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBe(9);
  });

  it('denies once the bucket is exhausted', async () => {
    const redis = new FakeRedisWithEval();
    const limiter = new RedisTokenBucketRateLimiter(redis as never, { capacity: 2, refillTokensPerSecond: 0 });

    await limiter.tryConsume('ip-1');
    await limiter.tryConsume('ip-1');
    const third = await limiter.tryConsume('ip-1');

    expect(third.allowed).toBe(false);
  });

  it('keys buckets independently per client', async () => {
    const redis = new FakeRedisWithEval();
    const limiter = new RedisTokenBucketRateLimiter(redis as never, { capacity: 1, refillTokensPerSecond: 0 });

    expect((await limiter.tryConsume('ip-a')).allowed).toBe(true);
    expect((await limiter.tryConsume('ip-a')).allowed).toBe(false);
    expect((await limiter.tryConsume('ip-b')).allowed).toBe(true);
  });
});
