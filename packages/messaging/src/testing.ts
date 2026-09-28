import { EventPublisherPort } from './outbox/EventPublisherPort';
import { OutboxRecord } from './outbox/OutboxRecord';

/** Records every record it's asked to publish, in order — for asserting
 * "this event was relayed" without a real Kafka broker. */
export class RecordingEventPublisher implements EventPublisherPort {
  readonly published: OutboxRecord[] = [];

  async publish(record: OutboxRecord): Promise<void> {
    this.published.push(record);
  }
}

/** Fails the first N publish attempts for a given record id, then
 * succeeds — for proving OutboxRelay's retry behavior without needing a
 * real, flaky network. */
export class FailingNTimesEventPublisher implements EventPublisherPort {
  private readonly failuresRemaining = new Map<string, number>();
  readonly published: OutboxRecord[] = [];

  constructor(private readonly failCount: number) {}

  async publish(record: OutboxRecord): Promise<void> {
    const remaining = this.failuresRemaining.get(record.id) ?? this.failCount;
    if (remaining > 0) {
      this.failuresRemaining.set(record.id, remaining - 1);
      throw new Error(`simulated failure (${remaining} remaining) for record ${record.id}`);
    }
    this.published.push(record);
  }
}
