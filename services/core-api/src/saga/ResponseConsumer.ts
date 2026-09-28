import { ConsumedMessage, MessageHandler } from '@etp/messaging';

/** The slice of KafkaConsumerRunner's API BookingSagaService actually
 * needs — abstracted so tests can inject a no-op instead of a real
 * consumer that would try to connect to a broker. */
export interface ResponseConsumer {
  start(handler: MessageHandler): Promise<void>;
  stop(): Promise<void>;
}

export type { ConsumedMessage };
