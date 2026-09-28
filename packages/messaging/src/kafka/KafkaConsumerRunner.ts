import type { Kafka, KafkaMessage } from 'kafkajs';
import { sleep } from '@etp/domain';

export interface ConsumedMessage {
  topic: string;
  key: string | null;
  value: string | null;
  headers: Record<string, string | undefined>;
}

export type MessageHandler = (message: ConsumedMessage) => Promise<void>;

export interface KafkaConsumerRunnerOptions {
  groupId: string;
  topics: string[];
  maxRetries?: number;
  retryBackoffMs?: number;
  dlqTopicSuffix?: string;
}

/**
 * Retry-then-dead-letter, applied at the application level rather than
 * relying on Kafka's own consumer-crash/rebalance behavior: a failing
 * message is retried in place (with linear backoff) up to `maxRetries`
 * times within the same `eachMessage` call. If it still fails, the raw
 * message is forwarded to `<topic>.dlq` and the offset is committed anyway
 * — a permanently-broken message (bad payload, a bug in the handler) would
 * otherwise wedge the partition forever, blocking every message behind it.
 * Trade-off: retries happen serially on the partition's single consumer,
 * so a slow-failing handler adds latency to everything queued after it on
 * that partition. Acceptable here because notification delivery isn't
 * latency-critical; documented as a limitation in ADR 0004.
 */
export class KafkaConsumerRunner {
  private readonly consumer;
  private readonly dlqProducer;

  constructor(
    private readonly kafka: Kafka,
    private readonly options: KafkaConsumerRunnerOptions,
  ) {
    this.consumer = kafka.consumer({ groupId: options.groupId });
    this.dlqProducer = kafka.producer();
  }

  async start(handler: MessageHandler): Promise<void> {
    await this.consumer.connect();
    await this.dlqProducer.connect();
    await this.consumer.subscribe({ topics: this.options.topics, fromBeginning: false });

    const maxRetries = this.options.maxRetries ?? 3;
    const retryBackoffMs = this.options.retryBackoffMs ?? 200;

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const consumed: ConsumedMessage = {
          topic,
          key: message.key?.toString() ?? null,
          value: message.value?.toString() ?? null,
          headers: this.decodeHeaders(message.headers),
        };

        for (let attempt = 0; ; attempt++) {
          try {
            await handler(consumed);
            return;
          } catch (err) {
            if (attempt >= maxRetries) {
              await this.sendToDlq(topic, message, err);
              return;
            }
            await sleep(retryBackoffMs * (attempt + 1));
          }
        }
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
    await this.dlqProducer.disconnect();
  }

  private async sendToDlq(originalTopic: string, message: KafkaMessage, err: unknown): Promise<void> {
    const dlqTopic = `${originalTopic}${this.options.dlqTopicSuffix ?? '.dlq'}`;
    const errorMessage = err instanceof Error ? err.message : String(err);
    await this.dlqProducer.send({
      topic: dlqTopic,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: { ...message.headers, error: errorMessage, originalTopic },
        },
      ],
    });
  }

  private decodeHeaders(
    headers: KafkaMessage['headers'],
  ): Record<string, string | undefined> {
    const decoded: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers ?? {})) {
      decoded[key] = Array.isArray(value) ? value[0]?.toString() : value?.toString();
    }
    return decoded;
  }
}
