import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { firstValueFrom, from, Observable } from 'rxjs';
import type Redis from 'ioredis';
import type { Request } from 'express';
import { sleep } from '@etp/domain';
import { REDIS_CLIENT } from '../persistence/tokens';

const CLAIM_TTL_MS = 60_000; // safety net if the handler itself hangs
const RESULT_TTL_SECONDS = 24 * 60 * 60;
const WAIT_ATTEMPTS = 40;
const WAIT_DELAY_MS = 250; // ~10s total before giving up on a concurrent duplicate

interface StoredResult {
  status: 'PENDING' | 'DONE';
  body?: unknown;
}

/**
 * A generic `Idempotency-Key` header (opt-in, Stripe-style) for POST
 * endpoints, applied globally (see common.module.ts) rather than repeated
 * per-controller. This is the same atomic-claim shape as
 * PaymentRepository.claim() (ADR 0003) and CatalogCacheService's stampede
 * lock: a naive "check cache, then process if absent" has the identical
 * check-then-act race this codebase keeps finding and fixing elsewhere, so
 * it's solved the same way here from the start — `SET NX` decides the
 * single winner, not application code.
 *
 * Only the response *body* is cached and replayed, deliberately not the
 * HTTP status code: Nest determines a route's status from its own
 * decorator metadata (`@HttpCode`, or the method default) independently of
 * whether an interceptor short-circuits the handler, so a replayed value
 * still gets the correct status automatically — trying to capture and
 * reapply `res.statusCode` here would be redundant at best and, given
 * Nest's response pipeline sets it *after* interceptors run, unreliable at
 * worst.
 *
 * Falls through to processing the request normally (no idempotency
 * protection for that one call) if Redis is unavailable or a concurrent
 * duplicate's result doesn't arrive within the wait budget — graceful
 * degradation over hanging the client indefinitely, the same trade-off
 * CatalogCacheService and BookingSagaService make.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.header('Idempotency-Key');

    if (!key || req.method !== 'POST') {
      return next.handle();
    }

    return from(this.handle(next, key));
  }

  private async handle(next: CallHandler, key: string): Promise<unknown> {
    const redisKey = `idempotency:${key}`;

    let claimed: 'OK' | null = null;
    try {
      claimed = await this.redis.set(redisKey, JSON.stringify({ status: 'PENDING' }), 'PX', CLAIM_TTL_MS, 'NX');
    } catch {
      claimed = null; // Redis unavailable -- proceed without idempotency protection
    }

    if (claimed !== 'OK') {
      const settled = await this.tryAwaitResult(redisKey);
      if (settled) {
        return settled.body;
      }
      // Either there was nothing to wait on (Redis threw above) or the
      // wait budget was exhausted -- either way, process normally rather
      // than hang the client.
    }

    const body = await firstValueFrom(next.handle());
    try {
      await this.redis.set(redisKey, JSON.stringify({ status: 'DONE', body }), 'EX', RESULT_TTL_SECONDS);
    } catch {
      // Best-effort: the request itself already succeeded correctly; a
      // failure to cache its result for future dedup isn't worth failing
      // the response the client is waiting on.
    }
    return body;
  }

  private async tryAwaitResult(redisKey: string): Promise<{ body: unknown } | null> {
    try {
      for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
        const raw = await this.redis.get(redisKey);
        if (!raw) {
          return null; // the claim vanished (TTL, or never existed) -- process fresh
        }
        const parsed = JSON.parse(raw) as StoredResult;
        if (parsed.status === 'DONE') {
          return { body: parsed.body };
        }
        await sleep(WAIT_DELAY_MS);
      }
      return null;
    } catch {
      return null;
    }
  }
}
