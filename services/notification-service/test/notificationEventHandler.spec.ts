import { BOOKING_CONFIRMED } from '@etp/domain';
import { handleNotificationEvent } from '../src/notificationEventHandler';
import { Notification } from '../src/notificationBuilder';
import { NotificationSender } from '../src/NotificationSender';

class RecordingSender implements NotificationSender {
  readonly sent: Notification[] = [];

  async send(notification: Notification): Promise<void> {
    this.sent.push(notification);
  }
}

const payload = { bookingId: 'b1', userId: 'u1', showId: 's1' };

describe('handleNotificationEvent', () => {
  it('sends the built notification when nothing fails', async () => {
    const sender = new RecordingSender();
    const result = await handleNotificationEvent(BOOKING_CONFIRMED, payload, sender, {
      simulatedFailureRate: 0,
    });

    expect(sender.sent).toHaveLength(1);
    expect(result?.to).toBe('u1');
  });

  it('returns null and sends nothing for an event type it does not act on', async () => {
    const sender = new RecordingSender();
    const result = await handleNotificationEvent('seats.held', payload, sender, {
      simulatedFailureRate: 0,
    });

    expect(result).toBeNull();
    expect(sender.sent).toHaveLength(0);
  });

  it('throws before sending when the simulated-failure roll lands below the configured rate', async () => {
    const sender = new RecordingSender();

    await expect(
      handleNotificationEvent(
        BOOKING_CONFIRMED,
        payload,
        sender,
        { simulatedFailureRate: 0.5 },
        () => 0.1, // < 0.5
      ),
    ).rejects.toThrow('simulated transient failure');

    expect(sender.sent).toHaveLength(0);
  });

  it('sends normally when the simulated-failure roll lands above the configured rate', async () => {
    const sender = new RecordingSender();

    await handleNotificationEvent(BOOKING_CONFIRMED, payload, sender, { simulatedFailureRate: 0.5 }, () => 0.9);

    expect(sender.sent).toHaveLength(1);
  });
});
