import { BookingState } from '../BookingState';
import { BookingStateHandler } from './BookingStateHandler';

/** Terminal: refund has been processed, nothing further to do. */
export class RefundedState extends BookingStateHandler {
  readonly state = BookingState.REFUNDED;

  protected next(): BookingState | undefined {
    return undefined;
  }
}
