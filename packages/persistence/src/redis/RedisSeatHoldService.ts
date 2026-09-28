import type Redis from 'ioredis';
import { SeatHoldService, SeatNotAvailableError, ShowSeatRepository } from '@etp/domain';

/**
 * Production seat-hold implementation: a Redis SET-NX-PX lock absorbs flash
 * -sale contention (thousands of requests hitting one seat key resolve in
 * Redis's single-threaded command loop in microseconds), then a Postgres
 * conditional UPDATE (ShowSeatRepository.tryTransition) is the actual
 * correctness guarantee.
 *
 * Redis is deliberately NOT the source of truth here. Without fsync-every-
 * write durability tuning, a lock key can be lost on a Redis restart/
 * failover, and a lost lock with no backstop is a real double-booking with
 * real financial consequences. Postgres's row-level atomicity is what
 * actually prevents that; Redis exists purely to keep 10K concurrent
 * requests from all hammering the same Postgres row during a flash sale.
 * See docs/adr/0002-seat-hold-concurrency-control.md for the full
 * comparison against pure row-locking and pure optimistic locking.
 */
export class RedisSeatHoldService implements SeatHoldService {
  constructor(
    private readonly showSeats: ShowSeatRepository,
    private readonly redis: Redis,
    private readonly ttlMs = 300_000,
  ) {}

  async hold(showId: string, seatId: string, holdId: string): Promise<void> {
    const lockKey = this.lockKey(showId, seatId);
    const acquired = await this.redis.set(lockKey, holdId, 'PX', this.ttlMs, 'NX');

    if (acquired !== 'OK') {
      // Someone else's lock is live -- fail fast without ever touching
      // Postgres. This is the contention-absorption Redis exists for.
      throw new SeatNotAvailableError(seatId);
    }

    let transitioned = false;
    try {
      transitioned = await this.showSeats.tryTransition({
        showId,
        seatId,
        from: 'AVAILABLE',
        to: 'HELD',
        holdId,
      });
    } finally {
      if (!transitioned) {
        // Either the DB disagreed with Redis (a rare inconsistency window —
        // see the ADR) or an unexpected error occurred. Either way, don't
        // leak a lock for a hold we don't actually have.
        await this.redis.del(lockKey);
      }
    }

    if (!transitioned) {
      throw new SeatNotAvailableError(seatId);
    }
  }

  private lockKey(showId: string, seatId: string): string {
    return `seatlock:${showId}:${seatId}`;
  }
}
