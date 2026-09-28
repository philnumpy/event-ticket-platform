import { ExecutionContext, HttpException } from '@nestjs/common';
import { TokenBucketGuard } from '../src/common/rate-limit/TokenBucketGuard';
import { RateLimiter } from '../src/common/rate-limit/RateLimiter';

function contextWithIp(ip: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
    }),
  } as unknown as ExecutionContext;
}

describe('TokenBucketGuard', () => {
  it('allows the request when the limiter allows it', async () => {
    const limiter: RateLimiter = { tryConsume: async () => ({ allowed: true, remainingTokens: 5 }) };
    const guard = new TokenBucketGuard(limiter);

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).resolves.toBe(true);
  });

  it('throws a 429 HttpException when the limiter denies the request', async () => {
    const limiter: RateLimiter = { tryConsume: async () => ({ allowed: false, remainingTokens: 0 }) };
    const guard = new TokenBucketGuard(limiter);

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).rejects.toMatchObject({
      status: 429,
    });
  });

  it('fails OPEN (allows the request) when the limiter itself throws', async () => {
    const limiter: RateLimiter = {
      tryConsume: async () => {
        throw new Error('Redis unreachable');
      },
    };
    const guard = new TokenBucketGuard(limiter);

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).resolves.toBe(true);
  });

  it('does not mask a genuine 429 as a fail-open success', async () => {
    const limiter: RateLimiter = { tryConsume: async () => ({ allowed: false, remainingTokens: 0 }) };
    const guard = new TokenBucketGuard(limiter);

    await expect(guard.canActivate(contextWithIp('1.2.3.4'))).rejects.toBeInstanceOf(HttpException);
  });
});
