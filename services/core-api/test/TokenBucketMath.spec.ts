import { refillAndConsume } from '../src/common/rate-limit/TokenBucketMath';

const config = { capacity: 10, refillTokensPerSecond: 5 };

describe('refillAndConsume', () => {
  it('starts a new bucket at full capacity and allows the first request', () => {
    const result = refillAndConsume(null, config, 1000, 1);
    expect(result.allowed).toBe(true);
    expect(result.nextState.tokens).toBe(9);
  });

  it('denies a request when the bucket has fewer tokens than requested, and does not deduct anything', () => {
    const state = { tokens: 0.5, lastRefillAt: 1000 };
    const result = refillAndConsume(state, config, 1000, 1); // no time elapsed, no refill
    expect(result.allowed).toBe(false);
    expect(result.nextState.tokens).toBe(0.5); // unchanged, not deducted
  });

  it('refills proportionally to elapsed time', () => {
    const state = { tokens: 0, lastRefillAt: 1000 };
    // 2 seconds elapsed at 5 tokens/sec = 10 tokens refilled
    const result = refillAndConsume(state, config, 3000, 1);
    expect(result.allowed).toBe(true);
    expect(result.nextState.tokens).toBe(9); // 10 refilled, 1 consumed
  });

  it('caps refill at capacity even after a long idle period', () => {
    const state = { tokens: 0, lastRefillAt: 1000 };
    const result = refillAndConsume(state, config, 1_000_000, 1); // ages, far more than capacity worth
    expect(result.nextState.tokens).toBe(config.capacity - 1);
  });

  it('allows exactly-enough tokens at the boundary', () => {
    const state = { tokens: 1, lastRefillAt: 1000 };
    const result = refillAndConsume(state, config, 1000, 1);
    expect(result.allowed).toBe(true);
    expect(result.nextState.tokens).toBe(0);
  });

  it('supports a request costing more than 1 token', () => {
    const state = { tokens: 5, lastRefillAt: 1000 };
    const denied = refillAndConsume(state, config, 1000, 6);
    expect(denied.allowed).toBe(false);

    const allowed = refillAndConsume(state, config, 1000, 5);
    expect(allowed.allowed).toBe(true);
    expect(allowed.nextState.tokens).toBe(0);
  });

  it('treats time moving backwards as zero elapsed time rather than draining tokens', () => {
    const state = { tokens: 5, lastRefillAt: 2000 };
    const result = refillAndConsume(state, config, 1000, 1); // "now" before lastRefillAt
    expect(result.nextState.tokens).toBe(4); // 5 - 1, no negative refill applied
  });
});
