import type { Producer } from 'kafkajs';
import { PAYMENT_GATEWAY_RESPONDED_TOPIC, PaymentGatewayRespondedMessage } from '@etp/messaging';
import { ResponsePublisher } from './paymentRequestHandler';

export class KafkaResponsePublisher implements ResponsePublisher {
  constructor(private readonly producer: Producer) {}

  async publishPaymentGatewayResponded(message: PaymentGatewayRespondedMessage): Promise<void> {
    await this.producer.send({
      topic: PAYMENT_GATEWAY_RESPONDED_TOPIC,
      messages: [{ key: message.bookingId, value: JSON.stringify(message) }],
    });
  }
}
