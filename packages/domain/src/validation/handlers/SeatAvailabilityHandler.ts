import { SeatNotAvailableError } from '../../errors/DomainErrors';
import { BookingValidationHandler } from '../BookingValidationHandler';
import { BookingValidationRequest } from '../BookingValidationRequest';

/** A coarse, pre-lock sanity check ("don't even try if it's obviously
 * taken"). It is NOT the source of truth for concurrency safety — that's
 * SeatHoldService's atomic check-and-set — so this only prevents wasted
 * work, it never has to be perfectly race-free. */
export class SeatAvailabilityHandler extends BookingValidationHandler {
  protected check(request: BookingValidationRequest): void {
    for (const showSeat of request.showSeats) {
      if (showSeat.status !== 'AVAILABLE') {
        throw new SeatNotAvailableError(showSeat.seatId);
      }
    }
  }
}
