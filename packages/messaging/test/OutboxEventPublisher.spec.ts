import { BOOKING_CONFIRMED, createEvent, DomainEventPublisher } from '@etp/domain';
import { InMemoryOutboxRepository } from '../src/outbox/InMemoryOutboxRepository';
import { OutboxEventPublisher } from '../src/outbox/OutboxEventPublisher';

describe('OutboxEventPublisher', () => {
  it('records every published domain event into the outbox', async () => {
    const outbox = new InMemoryOutboxRepository();
    const publisher = new DomainEventPublisher();
    new OutboxEventPublisher(outbox).register(publisher);

    await publisher.publish(
      createEvent(BOOKING_CONFIRMED, { bookingId: 'b1', userId: 'u1', showId: 's1' }),
    );

    const pending = await outbox.findUnpublished(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: BOOKING_CONFIRMED,
      payload: { bookingId: 'b1', userId: 'u1', showId: 's1' },
      publishedAt: null,
      attempts: 0,
    });
  });

  it('subscribes to every known booking event type', async () => {
    const outbox = new InMemoryOutboxRepository();
    const publisher = new DomainEventPublisher();
    new OutboxEventPublisher(outbox).register(publisher);

    await publisher.publish(createEvent('seats.held', { bookingId: 'b1' }));
    await publisher.publish(createEvent('booking.cancelled', { bookingId: 'b2' }));
    await publisher.publish(createEvent('refund.processed', { bookingId: 'b3' }));

    const pending = await outbox.findUnpublished(10);
    expect(pending.map((r) => r.type).sort()).toEqual(
      ['booking.cancelled', 'refund.processed', 'seats.held'].sort(),
    );
  });

  it('captures whatever the injected correlation-id provider returns at publish time', async () => {
    const outbox = new InMemoryOutboxRepository();
    const publisher = new DomainEventPublisher();
    let currentCorrelationId: string | undefined = 'trace-1';
    new OutboxEventPublisher(outbox, () => currentCorrelationId).register(publisher);

    await publisher.publish(createEvent(BOOKING_CONFIRMED, { bookingId: 'b1' }));
    currentCorrelationId = 'trace-2';
    await publisher.publish(createEvent(BOOKING_CONFIRMED, { bookingId: 'b2' }));

    const pending = await outbox.findUnpublished(10);
    expect(pending.find((r) => (r.payload as { bookingId: string }).bookingId === 'b1')?.correlationId).toBe(
      'trace-1',
    );
    expect(pending.find((r) => (r.payload as { bookingId: string }).bookingId === 'b2')?.correlationId).toBe(
      'trace-2',
    );
  });

  it('defaults correlationId to null when no provider is supplied', async () => {
    const outbox = new InMemoryOutboxRepository();
    const publisher = new DomainEventPublisher();
    new OutboxEventPublisher(outbox).register(publisher);

    await publisher.publish(createEvent(BOOKING_CONFIRMED, { bookingId: 'b1' }));

    expect((await outbox.findUnpublished(10))[0]?.correlationId).toBeNull();
  });
});
