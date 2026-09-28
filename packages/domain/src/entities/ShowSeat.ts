import { SeatNotAvailableError } from '../errors/DomainErrors';

export type ShowSeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface ShowSeatProps {
  showId: string;
  seatId: string;
  status?: ShowSeatStatus;
  holdId?: string | null;
}

/**
 * The inventory record for one seat on one show. Seats are global (tied to a
 * Venue); availability is per-show, which is why this is a separate entity
 * rather than a field on Seat — the same physical seat is independently
 * bookable across every show at that venue.
 */
export class ShowSeat {
  readonly showId: string;
  readonly seatId: string;
  private _status: ShowSeatStatus;
  private _holdId: string | null;

  constructor(props: ShowSeatProps) {
    this.showId = props.showId;
    this.seatId = props.seatId;
    this._status = props.status ?? 'AVAILABLE';
    this._holdId = props.holdId ?? null;
  }

  get id(): string {
    return `${this.showId}:${this.seatId}`;
  }

  get status(): ShowSeatStatus {
    return this._status;
  }

  get holdId(): string | null {
    return this._holdId;
  }

  /** Check-and-set: only legal from AVAILABLE. Callers racing this method
   * concurrently without external synchronization can both observe AVAILABLE
   * before either writes — see SeatHoldService for how Phase 1 makes this
   * atomic in-memory, and the Phase 2 ADR for the Redis/DB-backed version. */
  markHeld(holdId: string): void {
    if (this._status !== 'AVAILABLE') {
      throw new SeatNotAvailableError(this.seatId);
    }
    this._status = 'HELD';
    this._holdId = holdId;
  }

  markBooked(holdId: string): void {
    if (this._status !== 'HELD' || this._holdId !== holdId) {
      throw new SeatNotAvailableError(this.seatId);
    }
    this._status = 'BOOKED';
  }

  /** Idempotent: releasing a hold that no longer owns this seat is a no-op,
   * so a late/duplicate release (e.g. a retried expiry job) is always safe. */
  release(holdId: string): void {
    if (this._status === 'HELD' && this._holdId === holdId) {
      this._status = 'AVAILABLE';
      this._holdId = null;
    }
  }

  /** A real DB read deserializes a fresh object every time; repositories
   * should return copies, not live references into their internal storage,
   * so a caller can never mutate persisted state without an explicit
   * save(). Used by in-memory repository adapters for that reason. */
  clone(): ShowSeat {
    return new ShowSeat({
      showId: this.showId,
      seatId: this.seatId,
      status: this._status,
      holdId: this._holdId,
    });
  }
}
