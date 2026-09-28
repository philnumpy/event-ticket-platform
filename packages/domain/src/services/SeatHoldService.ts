export interface SeatHoldService {
  /** Attempt to atomically claim one seat for one hold. Throws
   * SeatNotAvailableError if the seat cannot be claimed. */
  hold(showId: string, seatId: string, holdId: string): Promise<void>;
}
