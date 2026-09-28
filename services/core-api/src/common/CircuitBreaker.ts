export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is open`);
  }
}

export interface CircuitBreakerOptions {
  /** Consecutive failures (from CLOSED) before the circuit opens. */
  failureThreshold: number;
  /** How long the circuit stays OPEN before allowing one HALF_OPEN probe. */
  cooldownMs: number;
  /** Optional per-call timeout; a call that never resolves is treated as a
   * failure rather than hanging the caller indefinitely. */
  timeoutMs?: number;
}

/**
 * Deliberately hand-rolled rather than pulling in opossum/cockatiel: this
 * project's whole point is demonstrating the mechanism, not consuming it as
 * a black box, and the full state machine is under 60 lines.
 *
 * CLOSED -> OPEN after `failureThreshold` consecutive failures. OPEN calls
 * fail immediately (CircuitBreakerOpenError) without touching the
 * downstream dependency at all — that's the point: once a dependency is
 * known-bad, stop making its problem worse by continuing to hit it.
 * After `cooldownMs`, the next call is allowed through as a HALF_OPEN
 * probe: success closes the circuit, failure reopens it immediately.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions,
    private readonly clock: () => number = Date.now,
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.clock() - (this.openedAt ?? 0) >= this.options.cooldownMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    try {
      const result = await this.withTimeout(fn());
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    if (!this.options.timeoutMs) {
      return promise;
    }
    const timeoutMs = this.options.timeoutMs;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker "${this.name}" call timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
    this.openedAt = null;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = this.clock();
    }
  }
}
