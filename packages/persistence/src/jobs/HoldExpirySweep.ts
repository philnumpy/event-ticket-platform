import { BookingApplicationService, HoldRepository } from '@etp/domain';

/**
 * Periodic reconciliation for holds whose TTL elapsed but were never
 * explicitly settled (payment never came back). A simple poll rather than
 * Redis keyspace-notification-driven eviction: notifications aren't
 * delivered exactly-once (a Redis restart silently drops pending
 * notifications), so most real systems keep a reconciliation sweep even
 * when they also wire up notifications as a lower-latency fast path. This
 * implementation is the sweep only; keyspace notifications are noted as a
 * Phase-5 "at 100x scale" optimization, not implemented here.
 */
export class HoldExpirySweep {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly holds: HoldRepository,
    private readonly bookingService: BookingApplicationService,
    private readonly intervalMs = 30_000,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<number> {
    const expired = await this.holds.findExpiredActive(this.clock());
    for (const hold of expired) {
      await this.bookingService.expireHold(hold);
    }
    return expired.length;
  }
}
