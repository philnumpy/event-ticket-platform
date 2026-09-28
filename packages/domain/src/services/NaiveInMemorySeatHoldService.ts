import { NotFoundError, SeatNotAvailableError } from '../errors/DomainErrors';
import { ShowSeatRepository } from '../repositories/ShowSeatRepository';
import { sleep } from '../shared/sleep';
import { SeatHoldService } from './SeatHoldService';

/**
 * DELIBERATELY BUGGY — exists to prove the double-booking failure mode, not
 * to be used anywhere real. It does a textbook check-then-act: read current
 * status, do some work (here, an artificial delay standing in for a real
 * network round-trip), then write. Two concurrent callers can both read
 * AVAILABLE before either writes, so both succeed and the seat is
 * double-booked. See SeatHoldConcurrency.spec.ts for the proof, and
 * GuardedInMemorySeatHoldService for the fix.
 */
export class NaiveInMemorySeatHoldService implements SeatHoldService {
  constructor(
    private readonly showSeats: ShowSeatRepository,
    private readonly artificialDelayMs = 5,
  ) {}

  async hold(showId: string, seatId: string, holdId: string): Promise<void> {
    const showSeat = await this.showSeats.findById(showId, seatId);
    if (!showSeat) {
      throw new NotFoundError('ShowSeat', `${showId}:${seatId}`);
    }

    if (showSeat.status !== 'AVAILABLE') {
      throw new SeatNotAvailableError(seatId);
    }

    // The race window: another caller can run this entire method between
    // this line and the write below.
    await sleep(this.artificialDelayMs);

    showSeat.markHeld(holdId);
    await this.showSeats.save(showSeat);
  }
}
