import { DomainEvent } from './DomainEvent';
import { DomainEventPublisher } from './DomainEventPublisher';
import {
  BOOKING_CANCELLED,
  BOOKING_CONFIRMED,
  BOOKING_EXPIRED,
  BookingCancelledPayload,
  BookingConfirmedPayload,
  BookingExpiredPayload,
} from './BookingEvents';

export interface SentNotification {
  channel: 'EMAIL' | 'SMS';
  to: string;
  message: string;
  eventType: string;
}

/** Concrete Observer. Phase 1 stub: records what it would have sent instead
 * of actually sending it, so tests can assert on `sent` without a real
 * email/SMS provider. Phase 3's notification-service is this same reaction
 * to the same event types, just consuming from Kafka instead of an
 * in-process publisher. */
export class NotificationDispatcher {
  readonly sent: SentNotification[] = [];

  register(publisher: DomainEventPublisher): void {
    publisher.subscribe<BookingConfirmedPayload>(BOOKING_CONFIRMED, (event) =>
      this.onBookingConfirmed(event),
    );
    publisher.subscribe<BookingCancelledPayload>(BOOKING_CANCELLED, (event) =>
      this.onBookingCancelled(event),
    );
    publisher.subscribe<BookingExpiredPayload>(BOOKING_EXPIRED, (event) =>
      this.onBookingExpired(event),
    );
  }

  private onBookingConfirmed(event: DomainEvent<BookingConfirmedPayload>): void {
    this.sent.push({
      channel: 'EMAIL',
      to: event.payload.userId,
      message: `Your booking ${event.payload.bookingId} is confirmed.`,
      eventType: event.type,
    });
  }

  private onBookingCancelled(event: DomainEvent<BookingCancelledPayload>): void {
    this.sent.push({
      channel: 'EMAIL',
      to: event.payload.userId,
      message: `Your booking ${event.payload.bookingId} was cancelled (${event.payload.reason}).`,
      eventType: event.type,
    });
  }

  private onBookingExpired(event: DomainEvent<BookingExpiredPayload>): void {
    this.sent.push({
      channel: 'SMS',
      to: event.payload.userId,
      message: `Your seat hold for booking ${event.payload.bookingId} expired.`,
      eventType: event.type,
    });
  }
}
