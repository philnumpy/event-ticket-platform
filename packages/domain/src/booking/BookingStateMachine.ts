import { BookingState, BookingTrigger } from './BookingState';
import { BookingStateHandler, BookingTransitionContext } from './states/BookingStateHandler';
import { InitiatedState } from './states/InitiatedState';
import { HeldState } from './states/HeldState';
import { PaidState } from './states/PaidState';
import { ConfirmedState } from './states/ConfirmedState';
import { CancelledState } from './states/CancelledState';
import { ExpiredState } from './states/ExpiredState';
import { RefundedState } from './states/RefundedState';

const HANDLERS: Record<BookingState, BookingStateHandler> = {
  [BookingState.INITIATED]: new InitiatedState(),
  [BookingState.HELD]: new HeldState(),
  [BookingState.PAID]: new PaidState(),
  [BookingState.CONFIRMED]: new ConfirmedState(),
  [BookingState.CANCELLED]: new CancelledState(),
  [BookingState.EXPIRED]: new ExpiredState(),
  [BookingState.REFUNDED]: new RefundedState(),
};

const DEFAULT_CONTEXT: BookingTransitionContext = { paymentCaptured: false };

/** Stateless facade over the per-state handler registry. Kept separate from
 * the Booking entity so the entity only ever stores a plain BookingState
 * enum value (trivially persistable) while transition logic lives here. */
export class BookingStateMachine {
  static apply(
    current: BookingState,
    trigger: BookingTrigger,
    ctx: BookingTransitionContext = DEFAULT_CONTEXT,
  ): BookingState {
    return HANDLERS[current].handle(trigger, ctx);
  }

  static isTerminal(state: BookingState, ctx: BookingTransitionContext = DEFAULT_CONTEXT): boolean {
    if (state === BookingState.EXPIRED || state === BookingState.REFUNDED) {
      return true;
    }
    if (state === BookingState.CANCELLED) {
      return !ctx.paymentCaptured;
    }
    return false;
  }
}
