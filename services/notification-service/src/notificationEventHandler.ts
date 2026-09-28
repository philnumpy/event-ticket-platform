import { buildNotification, Notification } from './notificationBuilder';
import { NotificationSender } from './NotificationSender';

export interface NotificationHandlerConfig {
  /** Probability [0,1] this call fails before sending — lets the retry
   * and dead-letter path (KafkaConsumerRunner) be exercised and observed
   * in a running demo instead of only in a unit test. Defaults to 0. */
  simulatedFailureRate: number;
}

export const DEFAULT_NOTIFICATION_HANDLER_CONFIG: NotificationHandlerConfig = {
  simulatedFailureRate: 0,
};

export function loadNotificationHandlerConfigFromEnv(): NotificationHandlerConfig {
  return {
    simulatedFailureRate: Number(
      process.env.NOTIFICATION_SIMULATED_FAILURE_RATE ??
        DEFAULT_NOTIFICATION_HANDLER_CONFIG.simulatedFailureRate,
    ),
  };
}

/**
 * Returns null for an event type this service doesn't act on (rather than
 * throwing), so a topic list drifting slightly ahead of this switch
 * statement fails soft, not by dead-lettering messages nothing was ever
 * going to handle.
 */
export async function handleNotificationEvent(
  eventType: string,
  payload: unknown,
  sender: NotificationSender,
  config: NotificationHandlerConfig = DEFAULT_NOTIFICATION_HANDLER_CONFIG,
  random: () => number = Math.random,
): Promise<Notification | null> {
  const notification = buildNotification(eventType, payload);
  if (!notification) {
    return null;
  }

  if (random() < config.simulatedFailureRate) {
    throw new Error(`simulated transient failure sending ${notification.channel} to ${notification.to}`);
  }

  await sender.send(notification);
  return notification;
}
