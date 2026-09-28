import { Notification } from './notificationBuilder';

export interface NotificationSender {
  send(notification: Notification): Promise<void>;
}

/** The mocked transport: no real email/SMS provider is wired up (out of
 * scope for this project), so "sending" means logging in a structured,
 * greppable form. Swapping this for a real provider (SES, Twilio, ...)
 * would not require touching notificationBuilder or the consumer wiring. */
export class ConsoleNotificationSender implements NotificationSender {
  async send(notification: Notification): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `[notification-service] ${notification.channel} -> ${notification.to}: ${notification.message}`,
    );
  }
}
