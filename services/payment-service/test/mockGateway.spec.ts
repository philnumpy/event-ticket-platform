import { decideOutcome, loadMockGatewayConfigFromEnv, MockGatewayConfig } from '../src/mockGateway';

/** decideOutcome calls `random()` three times, in order: outcome roll,
 * duplicate-callback roll, delay roll. This lets a test pin each
 * independently instead of one constant affecting all three. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length];
    i++;
    return value ?? 0;
  };
}

const config: MockGatewayConfig = {
  failureRate: 0.1,
  timeoutRate: 0.05,
  duplicateCallbackRate: 0.2,
  minDelayMs: 50,
  maxDelayMs: 150,
};

describe('decideOutcome', () => {
  it('returns FAILED when the outcome roll lands below failureRate', () => {
    const decision = decideOutcome(config, sequence(0.05, 1, 0));
    expect(decision.outcome).toBe('FAILED');
  });

  it('returns TIMEOUT when the outcome roll lands in [failureRate, failureRate+timeoutRate)', () => {
    const decision = decideOutcome(config, sequence(0.12, 1, 0));
    expect(decision.outcome).toBe('TIMEOUT');
  });

  it('treats the failureRate boundary itself as belonging to the timeout band, not failure', () => {
    const decision = decideOutcome(config, sequence(0.1, 1, 0));
    expect(decision.outcome).toBe('TIMEOUT');
  });

  it('returns SUCCESS when the outcome roll is above both bands', () => {
    const decision = decideOutcome(config, sequence(0.9, 1, 0));
    expect(decision.outcome).toBe('SUCCESS');
  });

  it('sets duplicateCallback true only when the second roll is below duplicateCallbackRate', () => {
    expect(decideOutcome(config, sequence(0.9, 0.1, 0)).duplicateCallback).toBe(true);
    expect(decideOutcome(config, sequence(0.9, 0.5, 0)).duplicateCallback).toBe(false);
  });

  it('computes delayMs within [minDelayMs, maxDelayMs)', () => {
    expect(decideOutcome(config, sequence(0.9, 1, 0)).delayMs).toBe(50);
    expect(decideOutcome(config, sequence(0.9, 1, 0.999)).delayMs).toBe(149);
  });

  it('defaults to Math.random when no random function is supplied', () => {
    const decision = decideOutcome(config);
    expect(['SUCCESS', 'FAILED', 'TIMEOUT']).toContain(decision.outcome);
    expect(decision.delayMs).toBeGreaterThanOrEqual(config.minDelayMs);
    expect(decision.delayMs).toBeLessThan(config.maxDelayMs);
  });
});

describe('loadMockGatewayConfigFromEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to defaults when no env vars are set', () => {
    delete process.env.PAYMENT_FAILURE_RATE;
    delete process.env.PAYMENT_TIMEOUT_RATE;
    const loaded = loadMockGatewayConfigFromEnv();
    expect(loaded.failureRate).toBe(0.1);
    expect(loaded.timeoutRate).toBe(0.05);
  });

  it('reads configured rates from the environment', () => {
    process.env.PAYMENT_FAILURE_RATE = '0.5';
    process.env.PAYMENT_DUPLICATE_CALLBACK_RATE = '0.9';
    const loaded = loadMockGatewayConfigFromEnv();
    expect(loaded.failureRate).toBe(0.5);
    expect(loaded.duplicateCallbackRate).toBe(0.9);
  });
});
