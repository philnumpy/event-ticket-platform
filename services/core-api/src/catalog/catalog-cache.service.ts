import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  BOOKING_CANCELLED,
  BOOKING_CONFIRMED,
  BOOKING_EXPIRED,
  CatalogQueryService,
  DomainEventPublisher,
  PAYMENT_FAILED,
  sleep,
  ShowSearchFilters,
  ShowSummary,
  ShowSeat,
} from '@etp/domain';
import { DOMAIN_EVENT_PUBLISHER, REDIS_CLIENT } from '../persistence/tokens';

const BROWSE_TTL_SECONDS = 30;
// Seat-map entries are read far more often than they change during a flash
// sale, but staleness there is exactly the "double-booking looking" UX bug
// this platform can't afford — kept short, and actively invalidated below.
const SEAT_MAP_TTL_SECONDS = 5;
const LOCK_TTL_MS = 2_000;
const STAMPEDE_RETRY_ATTEMPTS = 10;
const STAMPEDE_RETRY_DELAY_MS = 50;

/**
 * Cache-aside over CatalogQueryService, with two deliberate design choices:
 *
 * 1. Stampede protection: on a cache miss, the first caller takes a short
 *    Redis lock and computes the value; every other concurrent caller for
 *    the same key waits on the lock instead of also hitting Postgres. Without
 *    this, a popular show's cache entry expiring during a flash sale would
 *    otherwise send every one of 10K concurrent readers to the database at
 *    once — the exact thundering-herd failure cache-aside is supposed to
 *    prevent, not cause.
 * 2. Invalidation is event-driven, not manual: this service subscribes to
 *    the same DomainEventPublisher BookingApplicationService already
 *    publishes to (Observer pattern, Phase 1), so a seat's availability
 *    changing invalidates its show's seat-map cache with no coupling
 *    between the booking flow and this cache's existence.
 */
@Injectable()
export class CatalogCacheService implements OnModuleInit {
  constructor(
    private readonly catalog: CatalogQueryService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly publisher: DomainEventPublisher,
  ) {}

  onModuleInit(): void {
    for (const eventType of [BOOKING_CONFIRMED, BOOKING_CANCELLED, BOOKING_EXPIRED, PAYMENT_FAILED]) {
      this.publisher.subscribe<{ showId: string }>(eventType, (event) =>
        this.invalidateSeatMap(event.payload.showId),
      );
    }
  }

  async browse(filters: ShowSearchFilters): Promise<ShowSummary[]> {
    const key = `catalog:browse:${this.hashFilters(filters)}`;
    return this.cacheAside(key, BROWSE_TTL_SECONDS, () => this.catalog.browse(filters));
  }

  async seatMap(showId: string): Promise<ShowSeat[]> {
    const key = this.seatMapKey(showId);
    return this.cacheAside(key, SEAT_MAP_TTL_SECONDS, () => this.catalog.seatMap(showId));
  }

  async invalidateSeatMap(showId: string): Promise<void> {
    await this.redis.del(this.seatMapKey(showId));
  }

  private seatMapKey(showId: string): string {
    return `catalog:seatmap:${showId}`;
  }

  private async cacheAside<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    const lockKey = `lock:${key}`;
    const acquiredLock = await this.redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');

    if (acquiredLock !== 'OK') {
      // Someone else is already computing this key. Wait for them instead
      // of also querying the database.
      for (let attempt = 0; attempt < STAMPEDE_RETRY_ATTEMPTS; attempt++) {
        await sleep(STAMPEDE_RETRY_DELAY_MS);
        const retryValue = await this.redis.get(key);
        if (retryValue) {
          return JSON.parse(retryValue) as T;
        }
      }
      // Gave up waiting (the lock holder is unusually slow or crashed) --
      // compute it ourselves rather than fail the request.
      return compute();
    }

    try {
      const value = await compute();
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return value;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private hashFilters(filters: ShowSearchFilters): string {
    return Buffer.from(
      JSON.stringify({
        city: filters.city ?? null,
        genre: filters.genre ?? null,
        dateFrom: filters.dateFrom?.toISOString() ?? null,
        dateTo: filters.dateTo?.toISOString() ?? null,
      }),
    ).toString('base64url');
  }
}
