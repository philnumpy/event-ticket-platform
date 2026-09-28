import { BookingState, BookingTrigger } from '../BookingState';
import { BookingStateHandler } from './BookingStateHandler';

export class HeldState extends BookingStateHandler {
  readonly state = BookingState.HELD;

  protected next(trigger: BookingTrigger): BookingState | undefined {
    switch (trigger) {
      case BookingTrigger.PAYMENT_CAPTURED:
        return BookingState.PAID;
      case BookingTrigger.HOLD_EXPIRED:
        return BookingState.EXPIRED;
      case BookingTrigger.CANCEL_REQUESTED:
        return BookingState.CANCELLED;
      default:
        return undefined;
    }
  }
}
