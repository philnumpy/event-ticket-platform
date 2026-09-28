import { BookingState, BookingTrigger } from '../BookingState';
import { BookingStateHandler } from './BookingStateHandler';

export class ConfirmedState extends BookingStateHandler {
  readonly state = BookingState.CONFIRMED;

  protected next(trigger: BookingTrigger): BookingState | undefined {
    switch (trigger) {
      case BookingTrigger.CANCEL_REQUESTED:
        return BookingState.CANCELLED;
      default:
        return undefined;
    }
  }
}
