import { FraudSuspectedError } from '../../errors/DomainErrors';
import { BookingValidationHandler } from '../BookingValidationHandler';
import { BookingValidationRequest } from '../BookingValidationRequest';

/** Simple heuristic: a burst of bookings by the same user for the same show
 * in a short window looks like scalping/bot activity, not a genuine fan. */
export class DuplicateBookingFraudCheckHandler extends BookingValidationHandler {
  constructor(private readonly maxRecentBookings = 5) {
    super();
  }

  protected check(request: BookingValidationRequest): void {
    if (request.recentBookingCountForUser >= this.maxRecentBookings) {
      throw new FraudSuspectedError(
        `user "${request.userId}" made ${request.recentBookingCountForUser} bookings for show "${request.showId}" in the lookback window`,
      );
    }
  }
}
