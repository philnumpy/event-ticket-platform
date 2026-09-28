import { BookingState } from '../BookingState';
import { BookingStateHandler } from './BookingStateHandler';

/** Terminal: a hold that timed out unpaid has nothing further to do. */
export class ExpiredState extends BookingStateHandler {
  readonly state = BookingState.EXPIRED;

  protected next(): BookingState | undefined {
    return undefined;
  }
}
