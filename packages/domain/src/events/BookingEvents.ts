export const SEATS_HELD = 'seats.held';
export const BOOKING_CONFIRMED = 'booking.confirmed';
export const BOOKING_CANCELLED = 'booking.cancelled';
export const BOOKING_EXPIRED = 'booking.expired';
export const PAYMENT_FAILED = 'payment.failed';
export const REFUND_PROCESSED = 'refund.processed';

// Every payload below carries showId, even where the booking/hold id alone
// would identify the record — subscribers that only care about a show's
// aggregate state (cache invalidation, live seat-map dashboards) would
// otherwise have to look the booking back up just to find out which show's
// cache entry to drop.

export interface SeatsHeldPayload {
  bookingId: string;
  userId: string;
  showId: string;
  seatIds: string[];
}

export interface BookingConfirmedPayload {
  bookingId: string;
  userId: string;
  showId: string;
}

export interface BookingCancelledPayload {
  bookingId: string;
  userId: string;
  showId: string;
  reason: string;
}

export interface BookingExpiredPayload {
  bookingId: string;
  userId: string;
  showId: string;
  holdId: string;
}

export interface PaymentFailedPayload {
  bookingId: string;
  userId: string;
  showId: string;
  paymentId: string;
  status: 'FAILED' | 'TIMEOUT';
}

export interface RefundProcessedPayload {
  bookingId: string;
  userId: string;
  amountMinorUnits: number;
  currency: string;
}
