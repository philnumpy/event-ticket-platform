import { BookingState, BookingTrigger } from '../BookingState';
import { BookingStateHandler } from './BookingStateHandler';

export class PaidState extends BookingStateHandler {
  readonly state = BookingState.PAID;

  protected next(trigger: BookingTrigger): BookingState | undefined {
    switch (trigger) {
      case BookingTrigger.FINALIZATION_SUCCEEDED:
        return BookingState.CONFIRMED;
      // Payment succeeded but inventory finalization (marking the seat
      // BOOKED) failed — money was captured, so this is a compensating
      // transition into CANCELLED, which then requires a refund rather than
      // being a free terminal state. See CancelledState's guard.
      case BookingTrigger.FINALIZATION_FAILED:
        return BookingState.CANCELLED;
      default:
        return undefined;
    }
  }
}
