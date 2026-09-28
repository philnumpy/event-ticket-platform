import { TooManySeatsError } from '../../errors/DomainErrors';
import { BookingValidationHandler } from '../BookingValidationHandler';
import { BookingValidationRequest } from '../BookingValidationRequest';

/** Caps seats-per-booking, mostly to blunt bot/scalper bulk grabs during a
 * flash sale rather than to serve genuine group bookings. */
export class MaxSeatsPerBookingHandler extends BookingValidationHandler {
  constructor(private readonly maxSeats = 10) {
    super();
  }

  protected check(request: BookingValidationRequest): void {
    if (request.seatIds.length > this.maxSeats) {
      throw new TooManySeatsError(request.seatIds.length, this.maxSeats);
    }
  }
}
