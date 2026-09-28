export const BOOKING_CONFIRMED = 'booking.confirmed';
export const BOOKING_CANCELLED = 'booking.cancelled';
export const BOOKING_EXPIRED = 'booking.expired';
export const PAYMENT_FAILED = 'payment.failed';
export const REFUND_PROCESSED = 'refund.processed';

export interface BookingConfirmedPayload {
  bookingId: string;
  userId: string;
  showId: string;
}

export interface BookingCancelledPayload {
  bookingId: string;
  userId: string;
  reason: string;
}

export interface BookingExpiredPayload {
  bookingId: string;
  userId: string;
  holdId: string;
}

export interface PaymentFailedPayload {
  bookingId: string;
  userId: string;
  paymentId: string;
  status: 'FAILED' | 'TIMEOUT';
}

export interface RefundProcessedPayload {
  bookingId: string;
  userId: string;
  amountMinorUnits: number;
  currency: string;
}
