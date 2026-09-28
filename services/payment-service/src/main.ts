import { createKafkaClient, KafkaConsumerRunner, PAYMENT_REQUESTED_TOPIC, PaymentRequestedMessage } from '@etp/messaging';
import { KafkaResponsePublisher } from './KafkaResponsePublisher';
import { handlePaymentRequested } from './paymentRequestHandler';
import { loadMockGatewayConfigFromEnv } from './mockGateway';

async function main(): Promise<void> {
  const config = loadMockGatewayConfigFromEnv();
  const kafka = createKafkaClient('payment-service');
  const producer = kafka.producer();
  await producer.connect();
  const publisher = new KafkaResponsePublisher(producer);

  const consumer = new KafkaConsumerRunner(kafka, {
    groupId: 'payment-service',
    topics: [PAYMENT_REQUESTED_TOPIC],
  });

  await consumer.start(async (message) => {
    if (!message.value) return;
    const request = JSON.parse(message.value) as PaymentRequestedMessage;
    const decision = await handlePaymentRequested(request, config, publisher);
    // eslint-disable-next-line no-console
    console.log(
      `[payment-service] booking=${request.bookingId} outcome=${decision.outcome} ` +
        `duplicateCallback=${decision.duplicateCallback} delayMs=${decision.delayMs}`,
    );
  });

  // eslint-disable-next-line no-console
  console.log('payment-service consuming', PAYMENT_REQUESTED_TOPIC, 'with config', config);

  const shutdown = async () => {
    await consumer.stop();
    await producer.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('payment-service failed to start', err);
  process.exit(1);
});
