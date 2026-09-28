import { createKafkaClient, KafkaConsumerRunner } from '@etp/messaging';
import { ConsoleNotificationSender } from './NotificationSender';
import { handleNotificationEvent, loadNotificationHandlerConfigFromEnv } from './notificationEventHandler';
import { NOTIFICATION_TOPICS, topicToEventType } from './topics';

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
    const payload = JSON.parse(message.value);
    await handleNotificationEvent(eventType, payload, sender, config);
  });

  // eslint-disable-next-line no-console
  console.log('notification-service consuming', NOTIFICATION_TOPICS, 'with config', config);

  const shutdown = async () => {
    await consumer.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('notification-service failed to start', err);
  process.exit(1);
});
