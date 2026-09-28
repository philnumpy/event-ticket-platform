import { withRetryBackoff } from '../src/common/retryWithBackoff';

describe('withRetryBackoff', () => {
  it('returns the result on the first try without sleeping', async () => {
    const sleepFn = jest.fn(async () => undefined);
    const result = await withRetryBackoff(async () => 'ok', { maxAttempts: 3, baseDelayMs: 10 }, sleepFn);

    expect(result).toBe('ok');
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('retries after a failure and returns the eventual success', async () => {
    let attempts = 0;
    const sleepFn = jest.fn(async () => undefined);
    const result = await withRetryBackoff(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return 'ok';
      },
      { maxAttempts: 5, baseDelayMs: 10 },
      sleepFn,
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(sleepFn).toHaveBeenCalledTimes(2); // one sleep between each of the 2 failures and the next attempt
  });

  it('throws the last error once maxAttempts is exhausted', async () => {
    const sleepFn = jest.fn(async () => undefined);
    await expect(
      withRetryBackoff(
        async () => { throw new Error('always fails'); },
        { maxAttempts: 3, baseDelayMs: 10 },
        sleepFn,
      ),
    ).rejects.toThrow('always fails');
    expect(sleepFn).toHaveBeenCalledTimes(2); // never sleeps after the final attempt
  });

  it('backs off exponentially, capped at maxDelayMs', async () => {
    const delays: number[] = [];
    const sleepFn = jest.fn(async (ms: number) => {
      delays.push(ms);
    });

    await expect(
      withRetryBackoff(
        async () => { throw new Error('fail'); },
        { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 300 },
        sleepFn,
      ),
    ).rejects.toThrow();

    expect(delays).toEqual([100, 200, 300]); // 100, 200, 400-capped-to-300
  });
});
