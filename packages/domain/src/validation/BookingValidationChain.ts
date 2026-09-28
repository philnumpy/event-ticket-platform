import { BookingValidationHandler } from './BookingValidationHandler';
import { MaxSeatsPerBookingHandler } from './handlers/MaxSeatsPerBookingHandler';
import { SeatAvailabilityHandler } from './handlers/SeatAvailabilityHandler';
import { DuplicateBookingFraudCheckHandler } from './handlers/DuplicateBookingFraudCheckHandler';

/** Cheapest / most likely to reject first, so a request that's obviously
 * bad fails fast without paying for later checks. */
export class BookingValidationChain {
  static default(): BookingValidationHandler {
    const maxSeats = new MaxSeatsPerBookingHandler();
    const availability = new SeatAvailabilityHandler();
    const fraud = new DuplicateBookingFraudCheckHandler();

    maxSeats.setNext(availability).setNext(fraud);
    return maxSeats;
  }
}
