import { DomainEventPublisher } from '../../src/events/DomainEventPublisher';
import { createEvent } from '../../src/events/DomainEvent';

describe('DomainEventPublisher', () => {
  it('delivers an event only to subscribers of that exact type', async () => {
    const publisher = new DomainEventPublisher();
    const matched = jest.fn();
    const unmatched = jest.fn();

    publisher.subscribe('booking.confirmed', matched);
    publisher.subscribe('booking.cancelled', unmatched);

    await publisher.publish(createEvent('booking.confirmed', { bookingId: 'b1' }));

    expect(matched).toHaveBeenCalledTimes(1);
    expect(unmatched).not.toHaveBeenCalled();
  });

  it('invokes multiple subscribers for the same event type, in registration order', async () => {
    const publisher = new DomainEventPublisher();
    const calls: string[] = [];
    publisher.subscribe('x', () => {
      calls.push('first');
    });
    publisher.subscribe('x', () => {
      calls.push('second');
    });

    await publisher.publish(createEvent('x', {}));

    expect(calls).toEqual(['first', 'second']);
  });

  it('is a no-op when publishing an event type with no subscribers', async () => {
    const publisher = new DomainEventPublisher();
    await expect(publisher.publish(createEvent('nobody.listening', {}))).resolves.toBeUndefined();
  });

  it('awaits async subscribers before publish() resolves', async () => {
    const publisher = new DomainEventPublisher();
    let resolved = false;
    publisher.subscribe('x', async () => {
      await new Promise((r) => setTimeout(r, 5));
      resolved = true;
    });

    await publisher.publish(createEvent('x', {}));
    expect(resolved).toBe(true);
  });
});
