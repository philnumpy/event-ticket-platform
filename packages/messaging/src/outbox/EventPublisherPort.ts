import { OutboxRecord } from './OutboxRecord';

/** What OutboxRelay forwards a record to. Kafka in production; a recording
 * fake in tests — the same "port swapped per environment" shape as every
 * other boundary in this codebase. */
export interface EventPublisherPort {
  publish(record: OutboxRecord): Promise<void>;
}
