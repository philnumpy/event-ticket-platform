import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import type Redis from 'ioredis';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { TokenBucketGuard } from './rate-limit/TokenBucketGuard';
import { RedisTokenBucketRateLimiter } from './rate-limit/RedisTokenBucketRateLimiter';
import { RATE_LIMITER } from './rate-limit/tokens';
import { REDIS_CLIENT } from '../persistence/tokens';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { MetricsController } from './metrics/metrics.controller';

const RATE_LIMIT_CAPACITY = Number(process.env.RATE_LIMIT_CAPACITY ?? 20);
const RATE_LIMIT_REFILL_PER_SECOND = Number(process.env.RATE_LIMIT_REFILL_PER_SECOND ?? 10);

@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: RATE_LIMITER,
      useFactory: (redis: Redis) =>
        new RedisTokenBucketRateLimiter(redis, {
          capacity: RATE_LIMIT_CAPACITY,
          refillTokensPerSecond: RATE_LIMIT_REFILL_PER_SECOND,
        }),
      inject: [REDIS_CLIENT],
    },
    // Order matters: interceptors run in registration order on the way in.
    // Metrics wraps everything (including idempotency-replayed responses)
    // so replayed calls are still counted; idempotency itself must run
    // before the actual handler.
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_GUARD, useClass: TokenBucketGuard },
  ],
})
export class CommonModule {}
