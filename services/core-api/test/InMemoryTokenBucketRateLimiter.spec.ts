import { InMemoryTokenBucketRateLimiter } from '../src/common/rate-limit/InMemoryTokenBucketRateLimiter';

describe('InMemoryTokenBucketRateLimiter', () => {
  it('allows requests up to capacity, then denies', async () => {
    const clock = { now: 0 };
    const limiter = new InMemoryTokenBucketRateLimiter(
      { capacity: 3, refillTokensPerSecond: 1 },
      () => clock.now,
    );

    expect((await limiter.tryConsume('user-1')).allowed).toBe(true);
    expect((await limiter.tryConsume('user-1')).allowed).toBe(true);
    expect((await limiter.tryConsume('user-1')).allowed).toBe(true);
    expect((await limiter.tryConsume('user-1')).allowed).toBe(false);
  });

  it('tracks separate buckets per key', async () => {
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 1, refillTokensPerSecond: 1 });

    expect((await limiter.tryConsume('user-a')).allowed).toBe(true);
    expect((await limiter.tryConsume('user-a')).allowed).toBe(false);
    expect((await limiter.tryConsume('user-b')).allowed).toBe(true); // unaffected by user-a's bucket
  });

  it('refills over time and allows requests again', async () => {
    const clock = { now: 0 };
    const limiter = new InMemoryTokenBucketRateLimiter(
      { capacity: 1, refillTokensPerSecond: 1 },
      () => clock.now,
    );

    expect((await limiter.tryConsume('user-1')).allowed).toBe(true);
    expect((await limiter.tryConsume('user-1')).allowed).toBe(false);

    clock.now += 1000; // 1 second later, 1 token refilled
    expect((await limiter.tryConsume('user-1')).allowed).toBe(true);
  });

  it('lets exactly `capacity` of N concurrent requests through for the same key', async () => {
    const limiter = new InMemoryTokenBucketRateLimiter({ capacity: 5, refillTokensPerSecond: 0 });

    const results = await Promise.all(
      Array.from({ length: 50 }, () => limiter.tryConsume('flash-sale-user')),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(45);
  });
});
