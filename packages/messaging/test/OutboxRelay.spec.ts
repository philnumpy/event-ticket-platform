import { InMemoryOutboxRepository } from '../src/outbox/InMemoryOutboxRepository';
import { OutboxRelay } from '../src/outbox/OutboxRelay';
import { FailingNTimesEventPublisher, RecordingEventPublisher } from '../src/testing';

describe('OutboxRelay', () => {
  it('publishes every unpublished record and marks it published', async () => {
    const outbox = new InMemoryOutboxRepository();
    await outbox.save({ id: 'e1', type: 'booking.confirmed', payload: { bookingId: 'b1' }, occurredAt: new Date() });
    await outbox.save({ id: 'e2', type: 'booking.cancelled', payload: { bookingId: 'b2' }, occurredAt: new Date() });

    const publisher = new RecordingEventPublisher();
    const relay = new OutboxRelay(outbox, publisher);

    const result = await relay.runOnce();

    expect(result).toEqual({ published: 2, failed: 0, deadLettered: 0 });
    expect(publisher.published.map((r) => r.id).sort()).toEqual(['e1', 'e2']);
    expect(await outbox.findUnpublished(10)).toHaveLength(0);
  });

  it('does not republish an already-published record', async () => {
    const outbox = new InMemoryOutboxRepository();
    await outbox.save({ id: 'e1', type: 'booking.confirmed', payload: {}, occurredAt: new Date() });
    const publisher = new RecordingEventPublisher();
    const relay = new OutboxRelay(outbox, publisher);

    await relay.runOnce();
    await relay.runOnce();

    expect(publisher.published).toHaveLength(1);
  });

  it('retries a failing record and eventually succeeds within the attempt budget', async () => {
    const outbox = new InMemoryOutboxRepository();
    await outbox.save({ id: 'e1', type: 'booking.confirmed', payload: {}, occurredAt: new Date() });
    const publisher = new FailingNTimesEventPublisher(2); // fails twice, then succeeds
    const relay = new OutboxRelay(outbox, publisher, { maxAttempts: 5 });

    const first = await relay.runOnce();
    expect(first).toEqual({ published: 0, failed: 1, deadLettered: 0 });

    const second = await relay.runOnce();
    expect(second).toEqual({ published: 0, failed: 1, deadLettered: 0 });

    const third = await relay.runOnce();
    expect(third).toEqual({ published: 1, failed: 0, deadLettered: 0 });
    expect(publisher.published).toHaveLength(1);
  });

  it('dead-letters a record that exhausts its retry budget, and stops retrying it', async () => {
    const outbox = new InMemoryOutboxRepository();
    await outbox.save({ id: 'e1', type: 'booking.confirmed', payload: {}, occurredAt: new Date() });
    const publisher = new FailingNTimesEventPublisher(999); // always fails
    const relay = new OutboxRelay(outbox, publisher, { maxAttempts: 3 });

    await relay.runOnce(); // attempts: 1
    await relay.runOnce(); // attempts: 2
    const third = await relay.runOnce(); // attempts: 3 -- hits maxAttempts, dead-lettered

    expect(third).toEqual({ published: 0, failed: 1, deadLettered: 1 });

    // A 4th run must not even attempt the dead-lettered record.
    const fourth = await relay.runOnce();
    expect(fourth).toEqual({ published: 0, failed: 0, deadLettered: 0 });
  });

  it('processes independent records independently: one failing record does not block another', async () => {
    const outbox = new InMemoryOutboxRepository();
    await outbox.save({ id: 'good', type: 'booking.confirmed', payload: {}, occurredAt: new Date() });
    await outbox.save({ id: 'bad', type: 'booking.confirmed', payload: {}, occurredAt: new Date() });

    const publisher = new RecordingEventPublisher();
    const originalPublish = publisher.publish.bind(publisher);
    publisher.publish = async (record) => {
      if (record.id === 'bad') throw new Error('boom');
      await originalPublish(record);
    };

    const relay = new OutboxRelay(outbox, publisher);
    const result = await relay.runOnce();

    expect(result.published).toBe(1);
    expect(result.failed).toBe(1);
    expect(publisher.published.map((r) => r.id)).toEqual(['good']);
  });
});
