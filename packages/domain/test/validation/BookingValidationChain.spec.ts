import { BookingValidationChain } from '../../src/validation/BookingValidationChain';
import { BookingValidationRequest } from '../../src/validation/BookingValidationRequest';
import { ShowSeat } from '../../src/entities/ShowSeat';
import { TooManySeatsError, SeatNotAvailableError, FraudSuspectedError } from '../../src/errors/DomainErrors';

function baseRequest(overrides: Partial<BookingValidationRequest> = {}): BookingValidationRequest {
  return {
    userId: 'user-1',
    showId: 'show-1',
    seatIds: ['seat-1'],
    showSeats: [new ShowSeat({ showId: 'show-1', seatId: 'seat-1' })],
    recentBookingCountForUser: 0,
    ...overrides,
  };
}

describe('BookingValidationChain', () => {
  it('passes a valid request through every handler with no error', () => {
    expect(() => BookingValidationChain.default().handle(baseRequest())).not.toThrow();
  });

  it('rejects when too many seats are requested', () => {
    const seatIds = Array.from({ length: 11 }, (_, i) => `seat-${i}`);
    const showSeats = seatIds.map((id) => new ShowSeat({ showId: 'show-1', seatId: id }));
    expect(() =>
      BookingValidationChain.default().handle(baseRequest({ seatIds, showSeats })),
    ).toThrow(TooManySeatsError);
  });

  it('rejects when a requested seat is not AVAILABLE', () => {
    const heldSeat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1', status: 'HELD', holdId: 'h1' });
    expect(() =>
      BookingValidationChain.default().handle(baseRequest({ showSeats: [heldSeat] })),
    ).toThrow(SeatNotAvailableError);
  });

  it('rejects when the user has too many recent bookings for this show', () => {
    expect(() =>
      BookingValidationChain.default().handle(baseRequest({ recentBookingCountForUser: 5 })),
    ).toThrow(FraudSuspectedError);
  });

  it('runs handlers in order: seat-count check fires before availability is even checked', () => {
    const seatIds = Array.from({ length: 11 }, (_, i) => `seat-${i}`);
    // Deliberately empty showSeats — if SeatAvailabilityHandler ran first it
    // would not throw (no seats to fail on), so seeing TooManySeatsError
    // proves MaxSeatsPerBookingHandler runs first.
    expect(() =>
      BookingValidationChain.default().handle(baseRequest({ seatIds, showSeats: [] })),
    ).toThrow(TooManySeatsError);
  });
});
