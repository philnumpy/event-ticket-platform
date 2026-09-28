import { Money } from '../shared/Money';
import { RefundContext, RefundPolicy } from './RefundPolicy';

/** Fallback for anything too close to (or after) the show start. */
export class NoRefundPolicy implements RefundPolicy {
  readonly name = 'NO_REFUND';

  appliesTo(_hoursUntilShow: number): boolean {
    return true;
  }

  calculateRefund(ctx: RefundContext): Money {
    return Money.zero(ctx.amountPaid.currencyCode);
  }
}
