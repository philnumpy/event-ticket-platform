import { Money } from '../shared/Money';
import { RefundContext, RefundPolicy } from './RefundPolicy';

export class PartialRefundPolicy implements RefundPolicy {
  readonly name = 'PARTIAL_REFUND';

  constructor(
    private readonly minHoursBeforeShow: number,
    private readonly maxHoursBeforeShow: number,
    private readonly refundFraction: number,
  ) {}

  appliesTo(hoursUntilShow: number): boolean {
    return hoursUntilShow >= this.minHoursBeforeShow && hoursUntilShow < this.maxHoursBeforeShow;
  }

  calculateRefund(ctx: RefundContext): Money {
    return ctx.amountPaid.multiply(this.refundFraction);
  }
}
