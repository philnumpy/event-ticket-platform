import { createKafkaClient, KafkaConsumerRunner } from '@etp/messaging';
import { ConsoleNotificationSender } from './NotificationSender';
import { handleNotificationEvent, loadNotificationHandlerConfigFromEnv } from './notificationEventHandler';
import { NOTIFICATION_TOPICS, topicToEventType } from './topics';
import { logger } from './logger';

async function main(): Promise<void> {
  const config = loadNotificationHandlerConfigFromEnv();
  const sender = new ConsoleNotificationSender();
  const kafka = createKafkaClient('notification-service');

  const consumer = new KafkaConsumerRunner(kafka, {
    groupId: 'notification-service',
    topics: NOTIFICATION_TOPICS,
  });

  await consumer.start(async (message) => {
    if (!message.value) return;
    const eventType = topicToEventType(message.topic);
    // Propagated all the way from the originating HTTP request via
    // core-api's outbox (OutboxEventPublisher captures it,
    // KafkaEventPublisher carries it as a header) -- this is the far end
    // of that trace.
    const correlationId = message.headers.correlationId;
    const payload = JSON.parse(message.value);
    const notification = await handleNotificationEvent(eventType, payload, sender, config);
    logger.info({ correlationId, eventType, notification }, 'processed notification event');
  });

  logger.info({ topics: NOTIFICATION_TOPICS, config }, 'notification-service consuming');

  const shutdown = async () => {
    await consumer.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'notification-service failed to start');
  process.exit(1);
});
