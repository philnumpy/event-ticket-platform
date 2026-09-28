import { CircuitBreaker, CircuitBreakerOpenError } from '../src/common/CircuitBreaker';

describe('CircuitBreaker', () => {
  it('starts CLOSED and stays CLOSED while calls succeed', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3, cooldownMs: 1000 });
    await breaker.execute(async () => 'ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3, cooldownMs: 1000 });
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    }
    expect(breaker.getState()).toBe('OPEN');
  });

  it('a single success resets the consecutive-failure count', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3, cooldownMs: 1000 });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    await breaker.execute(async () => 'ok'); // resets the counter
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('CLOSED'); // only 1 consecutive failure since the reset
  });

  it('rejects immediately without calling fn while OPEN, before the cooldown elapses', async () => {
    let now = 0;
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, cooldownMs: 1000 }, () => now);
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');

    now += 500; // still within cooldown
    const fn = jest.fn(async () => 'should not run');
    await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('allows a HALF_OPEN probe after the cooldown elapses, closing on success', async () => {
    let now = 0;
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, cooldownMs: 1000 }, () => now);
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    expect(breaker.getState()).toBe('OPEN');

    now += 1000; // cooldown elapsed
    await breaker.execute(async () => 'recovered');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('reopens immediately if the HALF_OPEN probe fails', async () => {
    let now = 0;
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, cooldownMs: 1000 }, () => now);
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();

    now += 1000;
    await expect(breaker.execute(async () => { throw new Error('still broken'); })).rejects.toThrow(
      'still broken',
    );
    expect(breaker.getState()).toBe('OPEN');
  });

  it('treats a call exceeding timeoutMs as a failure', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, cooldownMs: 1000, timeoutMs: 20 });
    await expect(
      breaker.execute(() => new Promise((resolve) => setTimeout(resolve, 200))),
    ).rejects.toThrow('timed out');
    expect(breaker.getState()).toBe('OPEN');
  });

  it('calls onStateChange only when the state actually changes, not on every successful call', async () => {
    const transitions: string[] = [];
    let now = 0;
    const breaker = new CircuitBreaker(
      'test',
      { failureThreshold: 1, cooldownMs: 1000 },
      () => now,
      (state) => transitions.push(state),
    );

    await breaker.execute(async () => 'ok'); // already CLOSED -- no transition
    await breaker.execute(async () => 'ok');
    expect(transitions).toEqual([]);

    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow();
    expect(transitions).toEqual(['OPEN']);

    now += 1000;
    await breaker.execute(async () => 'recovered'); // enters HALF_OPEN for the probe, then closes on success
    expect(transitions).toEqual(['OPEN', 'HALF_OPEN', 'CLOSED']);
  });
});
