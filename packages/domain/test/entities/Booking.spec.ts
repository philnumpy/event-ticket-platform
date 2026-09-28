import { Booking } from '../../src/entities/Booking';
import { BookingState } from '../../src/booking/BookingState';
import { Money } from '../../src/shared/Money';
import { InvalidBookingStateTransitionError } from '../../src/errors/DomainErrors';

function makeBooking(): Booking {
  return new Booking({
    id: 'booking-1',
    userId: 'user-1',
    showId: 'show-1',
    seatIds: ['seat-1'],
    amount: Money.of(50000),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('Booking', () => {
  it('starts INITIATED with no hold and no captured payment', () => {
    const booking = makeBooking();
    expect(booking.state).toBe(BookingState.INITIATED);
    expect(booking.holdId).toBeNull();
    expect(booking.paymentCaptured).toBe(false);
  });

  it('walks the full happy path to CONFIRMED', () => {
    const booking = makeBooking();
    booking.attachHold('hold-1');
    expect(booking.state).toBe(BookingState.HELD);
    expect(booking.holdId).toBe('hold-1');

    booking.markPaymentCaptured();
    expect(booking.state).toBe(BookingState.PAID);
    expect(booking.paymentCaptured).toBe(true);

    booking.markFinalizationSucceeded();
    expect(booking.state).toBe(BookingState.CONFIRMED);
  });

  it('supports the compensating path: payment captured but finalization fails, then refunded', () => {
    const booking = makeBooking();
    booking.attachHold('hold-1');
    booking.markPaymentCaptured();
    booking.markFinalizationFailed();
    expect(booking.state).toBe(BookingState.CANCELLED);
    expect(booking.isTerminal()).toBe(false); // refund still owed

    booking.markRefunded();
    expect(booking.state).toBe(BookingState.REFUNDED);
    expect(booking.isTerminal()).toBe(true);
  });

  it('cancels cleanly before any payment is captured (terminal, no refund owed)', () => {
    const booking = makeBooking();
    booking.attachHold('hold-1');
    booking.cancel();
    expect(booking.state).toBe(BookingState.CANCELLED);
    expect(booking.isTerminal()).toBe(true);
  });

  it('expires a hold that was never paid', () => {
    const booking = makeBooking();
    booking.attachHold('hold-1');
    booking.markExpired();
    expect(booking.state).toBe(BookingState.EXPIRED);
    expect(booking.isTerminal()).toBe(true);
  });

  it('rejects a booking before a hold was ever acquired', () => {
    const booking = makeBooking();
    booking.rejectBeforeHold();
    expect(booking.state).toBe(BookingState.CANCELLED);
  });

  it('updates updatedAt on every transition', async () => {
    const booking = makeBooking();
    const before = booking.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    booking.attachHold('hold-1');
    expect(booking.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it('throws InvalidBookingStateTransitionError for an illegal transition', () => {
    const booking = makeBooking();
    expect(() => booking.markPaymentCaptured()).toThrow(InvalidBookingStateTransitionError);
  });
});
