import { BookingState, BookingTrigger } from '../BookingState';
import { InvalidBookingStateTransitionError } from '../../errors/DomainErrors';

/** Extra facts a state may need to decide a transition (e.g. whether money
 * has actually changed hands) that don't fit cleanly into the trigger name. */
export interface BookingTransitionContext {
  paymentCaptured: boolean;
}

/**
 * GoF State pattern: each BookingState owns its own legal outgoing
 * transitions, so adding/removing an edge touches exactly one class instead
 * of a growing switch statement shared by every state. `BookingStateMachine`
 * is the stateless registry that looks up the right handler for the
 * booking's *current* state (stored as a plain enum for persistence) and
 * delegates to it.
 */
export abstract class BookingStateHandler {
  abstract readonly state: BookingState;

  handle(trigger: BookingTrigger, ctx: BookingTransitionContext): BookingState {
    const next = this.next(trigger, ctx);
    if (next === undefined) {
      throw new InvalidBookingStateTransitionError(this.state, trigger);
    }
    return next;
  }

  protected abstract next(
    trigger: BookingTrigger,
    ctx: BookingTransitionContext,
  ): BookingState | undefined;
}
