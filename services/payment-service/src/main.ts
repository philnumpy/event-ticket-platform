import { createKafkaClient, KafkaConsumerRunner, PAYMENT_REQUESTED_TOPIC, PaymentRequestedMessage } from '@etp/messaging';
import { KafkaResponsePublisher } from './KafkaResponsePublisher';
import { handlePaymentRequested } from './paymentRequestHandler';
import { loadMockGatewayConfigFromEnv } from './mockGateway';
import { logger } from './logger';

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
    // Propagated from core-api's BookingSagaService (which read it from the
    // original HTTP request's correlation context) so this decision is
    // attributable to the same trace, even though it's happening in an
    // entirely separate process reached only via Kafka.
    const correlationId = message.headers.correlationId;
    const decision = await handlePaymentRequested(request, config, publisher, {}, correlationId);
    logger.info(
      { correlationId, bookingId: request.bookingId, ...decision },
      'processed payment.requested',
    );
  });

  logger.info({ topic: PAYMENT_REQUESTED_TOPIC, config }, 'payment-service consuming');

  const shutdown = async () => {
    await consumer.stop();
    await producer.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'payment-service failed to start');
  process.exit(1);
});
