import { EventPublisherPort, MessageHandler, OutboxRecord, PaymentRequestedMessage } from '@etp/messaging';
import { PaymentCommandPublisher } from '../../src/saga/PaymentCommandPublisher';
import { ResponseConsumer } from '../../src/saga/ResponseConsumer';

/** No-op stand-ins for the three places this app talks to a real Kafka
 * broker, so tests exercise all the DI wiring and business logic around
 * them without ever attempting a network connection. */

export class NoopEventPublisher implements EventPublisherPort {
  readonly published: OutboxRecord[] = [];

  async publish(record: OutboxRecord): Promise<void> {
    this.published.push(record);
  }
}

export class NoopPaymentCommandPublisher implements PaymentCommandPublisher {
  readonly requested: PaymentRequestedMessage[] = [];
  /** Flip on mid-test to simulate Kafka/payment-service being unreachable,
   * and prove BookingSagaService degrades gracefully instead of failing
   * the booking request that triggered it. */
  shouldFail = false;

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async publishPaymentRequested(message: PaymentRequestedMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error('simulated Kafka/payment-service unavailability');
    }
    this.requested.push(message);
  }
}

export class NoopResponseConsumer implements ResponseConsumer {
  private handler: MessageHandler | null = null;

  async start(handler: MessageHandler): Promise<void> {
    this.handler = handler;
  }

  async stop(): Promise<void> {
    this.handler = null;
  }

  /** Lets a test simulate payment-service's response without a real
   * broker: feeds a message straight to whatever handler start() was
   * called with, exactly as KafkaConsumerRunner would after receiving it
   * off the wire. */
  async simulateMessage(value: string): Promise<void> {
    await this.handler?.({ topic: 'etp.payment.gateway.responded', key: null, value, headers: {} });
  }
}
