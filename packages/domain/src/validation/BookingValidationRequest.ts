import { ShowSeat } from '../entities/ShowSeat';

export interface BookingValidationRequest {
  userId: string;
  showId: string;
  seatIds: string[];
  /** Pre-fetched inventory rows for exactly the requested seats. */
  showSeats: ShowSeat[];
  /** Count of bookings this user has made for this show in the fraud-check
   * lookback window, computed by the caller (keeps this validation layer
   * free of repository dependencies). */
  recentBookingCountForUser: number;
}
