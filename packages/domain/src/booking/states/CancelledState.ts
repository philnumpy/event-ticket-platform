import { BookingState, BookingTrigger } from '../BookingState';
import { BookingStateHandler, BookingTransitionContext } from './BookingStateHandler';

/**
 * CANCELLED has two conceptually different meanings depending on how it was
 * reached, which is why its only outgoing edge is guarded:
 *  - Reached from HELD (never paid): terminal, nothing owed, no valid next.
 *  - Reached from PAID or CONFIRMED (money was captured): a refund is owed,
 *    so REFUND_PROCESSED -> REFUNDED is legal once the refund is processed
 *    (even a zero-amount refund from a no-refund policy still "processes").
 */
export class CancelledState extends BookingStateHandler {
  readonly state = BookingState.CANCELLED;

  protected next(
    trigger: BookingTrigger,
    ctx: BookingTransitionContext,
  ): BookingState | undefined {
    if (trigger === BookingTrigger.REFUND_PROCESSED && ctx.paymentCaptured) {
      return BookingState.REFUNDED;
    }
    return undefined;
  }
}
