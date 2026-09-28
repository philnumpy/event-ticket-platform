import { Money } from '../shared/Money';

export interface RefundContext {
  amountPaid: Money;
  hoursUntilShow: number;
}

export interface RefundPolicy {
  readonly name: string;
  /** Whether this policy is the one that should apply, given how far out
   * the show is. RefundPolicySelector uses this to pick a policy without
   * the caller needing to know the threshold values. */
  appliesTo(hoursUntilShow: number): boolean;
  calculateRefund(ctx: RefundContext): Money;
}
