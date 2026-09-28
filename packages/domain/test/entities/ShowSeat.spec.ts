import { ShowSeat } from '../../src/entities/ShowSeat';
import { SeatNotAvailableError } from '../../src/errors/DomainErrors';

describe('ShowSeat', () => {
  it('starts AVAILABLE by default', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    expect(seat.status).toBe('AVAILABLE');
    expect(seat.holdId).toBeNull();
  });

  it('can be held from AVAILABLE', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    expect(seat.status).toBe('HELD');
    expect(seat.holdId).toBe('hold-1');
  });

  it('rejects a hold on a seat that is already HELD', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    expect(() => seat.markHeld('hold-2')).toThrow(SeatNotAvailableError);
  });

  it('rejects a hold on a seat that is already BOOKED', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    seat.markBooked('hold-1');
    expect(() => seat.markHeld('hold-2')).toThrow(SeatNotAvailableError);
  });

  it('books a seat only for the hold that currently owns it', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    expect(() => seat.markBooked('hold-2')).toThrow(SeatNotAvailableError);
    seat.markBooked('hold-1');
    expect(seat.status).toBe('BOOKED');
  });

  it('cannot book a seat that was never held', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    expect(() => seat.markBooked('hold-1')).toThrow(SeatNotAvailableError);
  });

  it('releases a held seat back to AVAILABLE', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    seat.release('hold-1');
    expect(seat.status).toBe('AVAILABLE');
    expect(seat.holdId).toBeNull();
  });

  it('release is a no-op for a hold that does not own the seat', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    seat.release('some-other-hold');
    expect(seat.status).toBe('HELD');
    expect(seat.holdId).toBe('hold-1');
  });

  it('release is a no-op on an AVAILABLE seat (safe to retry)', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.release('hold-1');
    expect(seat.status).toBe('AVAILABLE');
  });

  it('clone() returns an independent copy carrying the same state', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    seat.markHeld('hold-1');
    const clone = seat.clone();

    expect(clone.status).toBe('HELD');
    expect(clone.holdId).toBe('hold-1');

    clone.markBooked('hold-1');
    expect(clone.status).toBe('BOOKED');
    expect(seat.status).toBe('HELD'); // original untouched
  });

  it('id combines showId and seatId', () => {
    const seat = new ShowSeat({ showId: 'show-1', seatId: 'seat-1' });
    expect(seat.id).toBe('show-1:seat-1');
  });
});
