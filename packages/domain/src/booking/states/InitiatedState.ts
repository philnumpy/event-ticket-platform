import { BookingState, BookingTrigger } from '../BookingState';
import { BookingStateHandler } from './BookingStateHandler';

export class InitiatedState extends BookingStateHandler {
  readonly state = BookingState.INITIATED;

  protected next(trigger: BookingTrigger): BookingState | undefined {
    switch (trigger) {
      case BookingTrigger.HOLD_ACQUIRED:
        return BookingState.HELD;
      case BookingTrigger.REJECTED_BEFORE_HOLD:
        return BookingState.CANCELLED;
      default:
        return undefined;
    }
  }
}
