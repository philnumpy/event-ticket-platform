import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimiter } from './RateLimiter';
import { RATE_LIMITER } from './tokens';

/**
 * Applied globally (see common.module.ts) — every request spends one token
 * from a per-client-IP bucket. Nginx's `limit_req` (Phase 4's gateway,
 * docker-compose.yml/nginx/nginx.conf) sits in front of this as a coarse
 * first line of defense; it implements a *leaky* bucket, not a token
 * bucket, which is why the true token-bucket algorithm the platform
 * committed to lives here instead — see docs/adr/0005 for that
 * distinction and why both layers exist.
 */
@Injectable()
export class TokenBucketGuard implements CanActivate {
  private readonly logger = new Logger(TokenBucketGuard.name);

  constructor(@Inject(RATE_LIMITER) private readonly limiter: RateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.ip ?? 'unknown';

    try {
      const result = await this.limiter.tryConsume(key);
      if (!result.allowed) {
        throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Fail OPEN: the rate limiter's backing store being unavailable
      // should degrade to "unlimited" for the outage's duration, not take
      // the whole API down with it. Losing rate-limiting temporarily is a
      // much smaller problem than losing availability entirely.
      this.logger.error(
        `Rate limiter unavailable, failing open: ${err instanceof Error ? err.message : err}`,
      );
      return true;
    }
  }
}
