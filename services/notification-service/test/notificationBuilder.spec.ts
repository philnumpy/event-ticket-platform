import {
  BOOKING_CANCELLED,
  BOOKING_CONFIRMED,
  BOOKING_EXPIRED,
  PAYMENT_FAILED,
  REFUND_PROCESSED,
} from '@etp/domain';
import { buildNotification } from '../src/notificationBuilder';

describe('buildNotification', () => {
  it('builds an EMAIL for booking.confirmed', () => {
    const n = buildNotification(BOOKING_CONFIRMED, { bookingId: 'b1', userId: 'u1', showId: 's1' });
    expect(n).toEqual({
      channel: 'EMAIL',
      to: 'u1',
      message: 'Your booking b1 is confirmed.',
      eventType: BOOKING_CONFIRMED,
    });
  });

  it('builds an EMAIL for booking.cancelled including the reason', () => {
    const n = buildNotification(BOOKING_CANCELLED, {
      bookingId: 'b1',
      userId: 'u1',
      showId: 's1',
      reason: 'USER_CANCELLED_BEFORE_PAYMENT',
    });
    expect(n?.message).toContain('USER_CANCELLED_BEFORE_PAYMENT');
  });

  it('builds an SMS for booking.expired', () => {
    const n = buildNotification(BOOKING_EXPIRED, { bookingId: 'b1', userId: 'u1', showId: 's1', holdId: 'h1' });
    expect(n?.channel).toBe('SMS');
  });

  it('distinguishes FAILED from TIMEOUT wording for payment.failed', () => {
    const failed = buildNotification(PAYMENT_FAILED, {
      bookingId: 'b1', userId: 'u1', showId: 's1', paymentId: 'p1', status: 'FAILED',
    });
    const timedOut = buildNotification(PAYMENT_FAILED, {
      bookingId: 'b1', userId: 'u1', showId: 's1', paymentId: 'p1', status: 'TIMEOUT',
    });
    expect(failed?.message).toContain('failed');
    expect(timedOut?.message).toContain('timed out');
  });

  it('formats minor units as a decimal amount for refund.processed', () => {
    const n = buildNotification(REFUND_PROCESSED, {
      bookingId: 'b1', userId: 'u1', amountMinorUnits: 150099, currency: 'INR',
    });
    expect(n?.message).toContain('1500.99 INR');
  });

  it('returns null for an event type it does not handle', () => {
    expect(buildNotification('seats.held', { bookingId: 'b1' })).toBeNull();
    expect(buildNotification('unknown.event', {})).toBeNull();
  });
});
