import { KafkaEventPublisher } from '../src/kafka/KafkaEventPublisher';
import { OutboxRecord } from '../src/outbox/OutboxRecord';

class FakeProducer {
  readonly sent: Array<{ topic: string; messages: Array<{ key: unknown; value: unknown; headers?: unknown }> }> = [];
  async connect(): Promise<void> {}
  async send(payload: { topic: string; messages: Array<{ key: unknown; value: unknown; headers?: unknown }> }): Promise<void> {
    this.sent.push(payload);
  }
  async disconnect(): Promise<void> {}
}

class FakeKafka {
  readonly fakeProducer = new FakeProducer();
  producer(): FakeProducer {
    return this.fakeProducer;
  }
}

function makeRecord(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: 'evt-1',
    type: 'booking.confirmed',
    payload: { bookingId: 'b1' },
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    publishedAt: null,
    attempts: 0,
    lastError: null,
    deadLetteredAt: null,
    correlationId: null,
    ...overrides,
  };
}

describe('KafkaEventPublisher', () => {
  it('publishes to <prefix>.<type> keyed by the payload\'s bookingId', async () => {
    const kafka = new FakeKafka();
    const publisher = new KafkaEventPublisher(kafka as never);

    await publisher.publish(makeRecord());

    expect(kafka.fakeProducer.sent).toHaveLength(1);
    expect(kafka.fakeProducer.sent[0]?.topic).toBe('etp.booking.confirmed');
    expect(kafka.fakeProducer.sent[0]?.messages[0]?.key).toBe('b1');
  });

  it('falls back to the record id as the partition key when the payload has no bookingId', async () => {
    const kafka = new FakeKafka();
    const publisher = new KafkaEventPublisher(kafka as never);

    await publisher.publish(makeRecord({ payload: {}, id: 'evt-2' }));

    expect(kafka.fakeProducer.sent[0]?.messages[0]?.key).toBe('evt-2');
  });

  it('includes correlationId as a header when present on the record', async () => {
    const kafka = new FakeKafka();
    const publisher = new KafkaEventPublisher(kafka as never);

    await publisher.publish(makeRecord({ correlationId: 'trace-1' }));

    expect(kafka.fakeProducer.sent[0]?.messages[0]?.headers).toMatchObject({ correlationId: 'trace-1' });
  });

  it('omits the correlationId header entirely when the record has none', async () => {
    const kafka = new FakeKafka();
    const publisher = new KafkaEventPublisher(kafka as never);

    await publisher.publish(makeRecord({ correlationId: null }));

    expect(kafka.fakeProducer.sent[0]?.messages[0]?.headers).not.toHaveProperty('correlationId');
  });
});
