import { Booking } from '../entities/Booking';

export interface BookingRepository {
  findById(id: string): Promise<Booking | null>;
  findByHoldId(holdId: string): Promise<Booking | null>;
  findByUser(userId: string): Promise<Booking[]>;
  /** Count of bookings by this user for this show created within the last
   * `windowMinutes` — feeds DuplicateBookingFraudCheckHandler. */
  countRecentByUserAndShow(userId: string, showId: string, windowMinutes: number): Promise<number>;
  save(booking: Booking): Promise<void>;
}
