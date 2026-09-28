import type { Kafka, Producer } from 'kafkajs';
import { EventPublisherPort } from '../outbox/EventPublisherPort';
import { OutboxRecord } from '../outbox/OutboxRecord';

/**
 * Topic per event type (`etp.booking.confirmed`, `etp.payment.failed`, ...)
 * rather than one firehose topic: consumers (notification-service) subscribe
 * only to what they care about, and each type can be scaled/retained
 * independently. The partition key is the event's bookingId when present,
 * so every event about the same booking lands on the same partition and is
 * processed in order by whichever consumer owns that partition — the
 * sharding-by-bookingId strategy this platform's HLD uses for the database
 * too, applied consistently to the event stream.
 */
export class KafkaEventPublisher implements EventPublisherPort {
  private readonly producer: Producer;
  private connected = false;

  constructor(
    private readonly kafka: Kafka,
    private readonly topicPrefix = 'etp',
  ) {
    this.producer = kafka.producer();
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  async publish(record: OutboxRecord): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic: `${this.topicPrefix}.${record.type}`,
      messages: [
        {
          key: this.partitionKey(record),
          value: JSON.stringify(record.payload),
          headers: {
            eventId: record.id,
            occurredAt: record.occurredAt.toISOString(),
            ...(record.correlationId ? { correlationId: record.correlationId } : {}),
          },
        },
      ],
    });
  }

  private partitionKey(record: OutboxRecord): string {
    const payload = record.payload as { bookingId?: string } | null | undefined;
    return payload?.bookingId ?? record.id;
  }
}
