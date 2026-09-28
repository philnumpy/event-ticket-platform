import { EventPublisherPort } from './EventPublisherPort';
import { OutboxRepository } from './OutboxRepository';

export interface OutboxRelayOptions {
  batchSize?: number;
  maxAttempts?: number;
  pollIntervalMs?: number;
}

/**
 * The asynchronous half of the outbox pattern: polls for unpublished rows,
 * forwards each to the real transport (Kafka), and marks it published on
 * success. A row that keeps failing is retried up to `maxAttempts` times —
 * each failure is recorded, not silently dropped — and then dead-lettered:
 * excluded from further attempts but left in the table for inspection,
 * rather than deleted or retried forever.
 *
 * Polling rather than Postgres LISTEN/NOTIFY or Kafka Connect's Debezium
 * connector: simpler to run and reason about for this project's scale, at
 * the cost of up to one poll interval of extra latency before an event
 * reaches Kafka. That trade-off is spelled out in ADR 0004.
 */
export class OutboxRelay {
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly pollIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: EventPublisherPort,
    options: OutboxRelayOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 50;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Processes one batch. Returns counts so callers (and tests) don't have
   * to poll the repository separately to see what happened. */
  async runOnce(): Promise<{ published: number; failed: number; deadLettered: number }> {
    const pending = await this.outbox.findUnpublished(this.batchSize);
    let published = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const record of pending) {
      try {
        await this.publisher.publish(record);
        await this.outbox.markPublished(record.id);
        published++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.outbox.recordFailure(record.id, message);
        failed++;
        if (record.attempts + 1 >= this.maxAttempts) {
          await this.outbox.markDeadLettered(record.id);
          deadLettered++;
        }
      }
    }

    return { published, failed, deadLettered };
  }
}
