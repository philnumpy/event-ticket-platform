import type { Producer } from 'kafkajs';
import { PAYMENT_REQUESTED_TOPIC, PaymentRequestedMessage } from '@etp/messaging';

export interface PaymentCommandPublisher {
  publishPaymentRequested(message: PaymentRequestedMessage): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/** Thin wrapper so BookingSagaService depends on an interface it can be
 * tested against, not a raw kafkajs Producer it would otherwise have to
 * construct itself (and every test would then need a real broker for). */
export class KafkaPaymentCommandPublisher implements PaymentCommandPublisher {
  private connected = false;

  constructor(private readonly producer: Producer) {}

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  async publishPaymentRequested(message: PaymentRequestedMessage): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic: PAYMENT_REQUESTED_TOPIC,
      messages: [{ key: message.bookingId, value: JSON.stringify(message) }],
    });
  }
}
