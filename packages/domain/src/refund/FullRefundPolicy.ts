import { Money } from '../shared/Money';
import { RefundContext, RefundPolicy } from './RefundPolicy';

export class FullRefundPolicy implements RefundPolicy {
  readonly name = 'FULL_REFUND';

  constructor(private readonly minHoursBeforeShow: number) {}

  appliesTo(hoursUntilShow: number): boolean {
    return hoursUntilShow >= this.minHoursBeforeShow;
  }

  calculateRefund(ctx: RefundContext): Money {
    return ctx.amountPaid;
  }
}
