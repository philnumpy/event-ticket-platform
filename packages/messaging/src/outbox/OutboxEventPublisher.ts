import { randomUUID } from 'node:crypto';
import { ALL_BOOKING_EVENT_TYPES, DomainEventPublisher } from '@etp/domain';
import { OutboxRepository } from './OutboxRepository';

/**
 * Observer, same shape as NotificationDispatcher (Phase 1): subscribes to
 * every event BookingApplicationService publishes and durably records it.
 * This is the "write" side of the outbox pattern — a fast, synchronous
 * insert that happens in the same call as every other subscriber, so it's
 * consistent with whatever else observed the event. OutboxRelay is the
 * separate, asynchronous "read and forward to Kafka" side.
 *
 * Honest limitation, documented in ADR 0004: this insert is NOT in the same
 * database transaction as the booking/seat/payment row it describes, so
 * there's a narrow window (a crash between the business save() and this
 * publish() call) where an event could be lost. A fully rigorous
 * implementation would require the application service to run inside a
 * persistence-layer transaction that also writes this row — see the ADR
 * for why that was judged not worth the resulting coupling for this
 * project's scope, and what closes the gap at 100x scale (CDC on the WAL).
 */
export class OutboxEventPublisher {
  constructor(private readonly outbox: OutboxRepository) {}

  register(publisher: DomainEventPublisher): void {
    for (const eventType of ALL_BOOKING_EVENT_TYPES) {
      publisher.subscribe(eventType, async (event) => {
        await this.outbox.save({
          id: randomUUID(),
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        });
      });
    }
  }
}
