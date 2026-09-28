import { DomainEvent } from './DomainEvent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: DomainEvent<any>) => void | Promise<void>;

/**
 * Observer pattern: subject that subscribers (NotificationDispatcher today,
 * a Kafka outbox publisher in Phase 3) register against by event type. The
 * in-memory implementation here is intentionally swappable — nothing in the
 * domain layer depends on *how* an event reaches its subscribers, only that
 * it does, which is what lets Phase 3 replace this with an outbox-backed
 * Kafka publisher without touching a single entity or use case.
 */
export class DomainEventPublisher {
  private readonly subscribers = new Map<string, Handler[]>();

  subscribe<T>(eventType: string, handler: (event: DomainEvent<T>) => void | Promise<void>): void {
    const list = this.subscribers.get(eventType) ?? [];
    list.push(handler as Handler);
    this.subscribers.set(eventType, list);
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    const handlers = this.subscribers.get(event.type) ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }
}
