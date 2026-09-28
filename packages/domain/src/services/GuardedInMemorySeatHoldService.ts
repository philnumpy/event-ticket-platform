import { NotFoundError, SeatNotAvailableError } from '../errors/DomainErrors';
import { ShowSeatRepository } from '../repositories/ShowSeatRepository';
import { sleep } from '../shared/sleep';
import { SeatHoldService } from './SeatHoldService';

/**
 * Fixes NaiveInMemorySeatHoldService's race by serializing check-and-set per
 * (showId, seatId) key with an in-process keyed mutex, implemented as a
 * chain of promises: each new request for a key attaches itself after
 * whatever is currently running for that key, so only one hold attempt per
 * seat is ever "in flight" at a time. Different seats are unaffected and run
 * fully concurrently.
 *
 * This is the in-memory analogue of a real distributed lock. It works for a
 * single Node process; it does NOT work across multiple replicas of a
 * service, which is exactly why Phase 2 replaces it with a Redis
 * SET-NX-PX-backed lock (see docs/adr for the row-locking vs optimistic
 * vs Redis trade-off) while keeping this same SeatHoldService interface.
 */
export class GuardedInMemorySeatHoldService implements SeatHoldService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly showSeats: ShowSeatRepository,
    private readonly artificialDelayMs = 5,
  ) {}

  async hold(showId: string, seatId: string, holdId: string): Promise<void> {
    const key = `${showId}:${seatId}`;

    const attempt = async (): Promise<void> => {
      const showSeat = await this.showSeats.findById(showId, seatId);
      if (!showSeat) {
        throw new NotFoundError('ShowSeat', key);
      }
      if (showSeat.status !== 'AVAILABLE') {
        throw new SeatNotAvailableError(seatId);
      }
      await sleep(this.artificialDelayMs);
      showSeat.markHeld(holdId);
      await this.showSeats.save(showSeat);
    };

    const previous = this.queues.get(key) ?? Promise.resolve();
    // Chain this attempt after the previous one regardless of whether it
    // succeeded or failed, so one caller's SeatNotAvailableError never
    // blocks the queue for everyone else racing the same seat.
    const result = previous.then(attempt, attempt);
    this.queues.set(
      key,
      result.catch(() => undefined),
    );
    return result;
  }
}
