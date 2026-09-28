import { NOTIFICATION_TOPICS, topicToEventType } from '../src/topics';

describe('topics', () => {
  it('lists one etp.-prefixed topic per event type this service handles', () => {
    expect(NOTIFICATION_TOPICS).toEqual([
      'etp.booking.confirmed',
      'etp.booking.cancelled',
      'etp.booking.expired',
      'etp.payment.failed',
      'etp.refund.processed',
    ]);
  });

  it('strips the prefix back off to recover the domain event type', () => {
    expect(topicToEventType('etp.booking.confirmed')).toBe('booking.confirmed');
  });

  it('passes through a topic that never had the prefix', () => {
    expect(topicToEventType('booking.confirmed')).toBe('booking.confirmed');
  });
});
