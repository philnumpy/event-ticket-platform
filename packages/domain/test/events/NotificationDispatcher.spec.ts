import { DomainEventPublisher } from '../../src/events/DomainEventPublisher';
import { NotificationDispatcher } from '../../src/events/NotificationDispatcher';
import { createEvent } from '../../src/events/DomainEvent';
import { BOOKING_CONFIRMED, BOOKING_CANCELLED, BOOKING_EXPIRED } from '../../src/events/BookingEvents';

describe('NotificationDispatcher', () => {
  it('records an email for a confirmed booking', async () => {
    const publisher = new DomainEventPublisher();
    const dispatcher = new NotificationDispatcher();
    dispatcher.register(publisher);

    await publisher.publish(
      createEvent(BOOKING_CONFIRMED, { bookingId: 'b1', userId: 'u1', showId: 's1' }),
    );

    expect(dispatcher.sent).toHaveLength(1);
    expect(dispatcher.sent[0]).toMatchObject({ channel: 'EMAIL', to: 'u1' });
  });

  it('records an email for a cancelled booking with the reason in the message', async () => {
    const publisher = new DomainEventPublisher();
    const dispatcher = new NotificationDispatcher();
    dispatcher.register(publisher);

    await publisher.publish(
      createEvent(BOOKING_CANCELLED, { bookingId: 'b1', userId: 'u1', reason: 'NO_REFUND' }),
    );

    expect(dispatcher.sent[0]?.message).toContain('NO_REFUND');
  });

  it('records an SMS for an expired hold', async () => {
    const publisher = new DomainEventPublisher();
    const dispatcher = new NotificationDispatcher();
    dispatcher.register(publisher);

    await publisher.publish(
      createEvent(BOOKING_EXPIRED, { bookingId: 'b1', userId: 'u1', holdId: 'h1' }),
    );

    expect(dispatcher.sent[0]).toMatchObject({ channel: 'SMS', to: 'u1' });
  });

  it('ignores event types it never registered for', async () => {
    const publisher = new DomainEventPublisher();
    const dispatcher = new NotificationDispatcher();
    dispatcher.register(publisher);

    await publisher.publish(createEvent('payment.failed', { bookingId: 'b1' }));

    expect(dispatcher.sent).toHaveLength(0);
  });
});
