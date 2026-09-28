import { KafkaConsumerRunner } from '../src/kafka/KafkaConsumerRunner';

type EachMessageCallback = (payload: {
  topic: string;
  partition: number;
  message: { key: Buffer | null; value: Buffer | null; headers: Record<string, Buffer> };
}) => Promise<void>;

class FakeConsumer {
  eachMessage: EachMessageCallback | null = null;
  connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async subscribe(): Promise<void> {}

  async run({ eachMessage }: { eachMessage: EachMessageCallback }): Promise<void> {
    this.eachMessage = eachMessage;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async deliver(topic: string, key: string, value: string): Promise<void> {
    if (!this.eachMessage) throw new Error('consumer.run() was never called');
    await this.eachMessage({
      topic,
      partition: 0,
      message: { key: Buffer.from(key), value: Buffer.from(value), headers: {} },
    });
  }
}

class FakeProducer {
  readonly sent: Array<{ topic: string; messages: Array<{ key: unknown; value: unknown; headers?: unknown }> }> = [];

  async connect(): Promise<void> {}

  async send(payload: { topic: string; messages: Array<{ key: unknown; value: unknown; headers?: unknown }> }): Promise<void> {
    this.sent.push(payload);
  }

  async disconnect(): Promise<void> {}
}

class FakeKafka {
  readonly fakeConsumer = new FakeConsumer();
  readonly fakeProducer = new FakeProducer();

  consumer(): FakeConsumer {
    return this.fakeConsumer;
  }

  producer(): FakeProducer {
    return this.fakeProducer;
  }
}

describe('KafkaConsumerRunner', () => {
  it('processes a message successfully on the first attempt: no retry, no DLQ', async () => {
    const kafka = new FakeKafka();
    const runner = new KafkaConsumerRunner(kafka as never, {
      groupId: 'g1',
      topics: ['orders'],
      maxRetries: 3,
      retryBackoffMs: 1,
    });

    let calls = 0;
    await runner.start(async () => {
      calls++;
    });
    await kafka.fakeConsumer.deliver('orders', 'k1', 'v1');

    expect(calls).toBe(1);
    expect(kafka.fakeProducer.sent).toHaveLength(0);
  });

  it('retries a failing handler up to maxRetries, then succeeds without hitting the DLQ', async () => {
    const kafka = new FakeKafka();
    const runner = new KafkaConsumerRunner(kafka as never, {
      groupId: 'g1',
      topics: ['orders'],
      maxRetries: 3,
      retryBackoffMs: 1,
    });

    let calls = 0;
    await runner.start(async () => {
      calls++;
      if (calls <= 2) throw new Error('transient failure');
    });
    await kafka.fakeConsumer.deliver('orders', 'k1', 'v1');

    expect(calls).toBe(3); // 2 failures + 1 success, all within the retry budget
    expect(kafka.fakeProducer.sent).toHaveLength(0);
  });

  it('sends a permanently-failing message to <topic>.dlq after exhausting retries, and does not throw', async () => {
    const kafka = new FakeKafka();
    const runner = new KafkaConsumerRunner(kafka as never, {
      groupId: 'g1',
      topics: ['orders'],
      maxRetries: 2,
      retryBackoffMs: 1,
    });

    let calls = 0;
    await runner.start(async () => {
      calls++;
      throw new Error('permanently broken');
    });
    await expect(kafka.fakeConsumer.deliver('orders', 'k1', 'the-payload')).resolves.toBeUndefined();

    expect(calls).toBe(3); // initial attempt + 2 retries
    expect(kafka.fakeProducer.sent).toHaveLength(1);
    expect(kafka.fakeProducer.sent[0]?.topic).toBe('orders.dlq');
    expect(kafka.fakeProducer.sent[0]?.messages[0]?.value?.toString()).toBe('the-payload');
    expect((kafka.fakeProducer.sent[0]?.messages[0]?.headers as Record<string, string>)?.error).toContain(
      'permanently broken',
    );
  });

  it('does not let one permanently-failing message block the next message on the same partition', async () => {
    const kafka = new FakeKafka();
    const runner = new KafkaConsumerRunner(kafka as never, {
      groupId: 'g1',
      topics: ['orders'],
      maxRetries: 1,
      retryBackoffMs: 1,
    });

    const processed: string[] = [];
    await runner.start(async (message) => {
      if (message.key === 'bad') throw new Error('boom');
      processed.push(message.key ?? '');
    });

    await kafka.fakeConsumer.deliver('orders', 'bad', 'v1');
    await kafka.fakeConsumer.deliver('orders', 'good', 'v2');

    expect(processed).toEqual(['good']);
    expect(kafka.fakeProducer.sent).toHaveLength(1); // only the bad one dead-lettered
  });
});
