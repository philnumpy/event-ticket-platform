import {
  BOOKING_CANCELLED,
  BOOKING_CONFIRMED,
  BOOKING_EXPIRED,
  BookingCancelledPayload,
  BookingConfirmedPayload,
  BookingExpiredPayload,
  PAYMENT_FAILED,
  PaymentFailedPayload,
  REFUND_PROCESSED,
  RefundProcessedPayload,
} from '@etp/domain';

export interface Notification {
  channel: 'EMAIL' | 'SMS';
  to: string;
  message: string;
  eventType: string;
}

/**
 * The real counterpart to @etp/domain's NotificationDispatcher stub — same
 * event-to-message mapping, deliberately, so the Phase 1 in-memory
 * demonstration and this actually-running service tell the same story.
 * Pure function: no Kafka, no I/O, trivially unit-testable.
 */
export function buildNotification(eventType: string, payload: unknown): Notification | null {
  switch (eventType) {
    case BOOKING_CONFIRMED: {
      const p = payload as BookingConfirmedPayload;
      return {
        channel: 'EMAIL',
        to: p.userId,
        message: `Your booking ${p.bookingId} is confirmed.`,
        eventType,
      };
    }
    case BOOKING_CANCELLED: {
      const p = payload as BookingCancelledPayload;
      return {
        channel: 'EMAIL',
        to: p.userId,
        message: `Your booking ${p.bookingId} was cancelled (${p.reason}).`,
        eventType,
      };
    }
    case BOOKING_EXPIRED: {
      const p = payload as BookingExpiredPayload;
      return {
        channel: 'SMS',
        to: p.userId,
        message: `Your seat hold for booking ${p.bookingId} expired.`,
        eventType,
      };
    }
    case PAYMENT_FAILED: {
      const p = payload as PaymentFailedPayload;
      const verb = p.status === 'TIMEOUT' ? 'timed out' : 'failed';
      return {
        channel: 'EMAIL',
        to: p.userId,
        message: `Payment for booking ${p.bookingId} ${verb}.`,
        eventType,
      };
    }
    case REFUND_PROCESSED: {
      const p = payload as RefundProcessedPayload;
      const amount = (p.amountMinorUnits / 100).toFixed(2);
      return {
        channel: 'EMAIL',
        to: p.userId,
        message: `Refund of ${amount} ${p.currency} processed for booking ${p.bookingId}.`,
        eventType,
      };
    }
    default:
      return null;
  }
}
