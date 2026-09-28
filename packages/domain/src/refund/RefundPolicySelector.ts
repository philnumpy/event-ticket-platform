import { RefundPolicy } from './RefundPolicy';
import { FullRefundPolicy } from './FullRefundPolicy';
import { PartialRefundPolicy } from './PartialRefundPolicy';
import { NoRefundPolicy } from './NoRefundPolicy';

/** Ordered most-generous-first; the first policy whose window matches wins.
 * NoRefundPolicy.appliesTo() always returns true, so it's the catch-all and
 * must stay last. */
const DEFAULT_POLICIES: RefundPolicy[] = [
  new FullRefundPolicy(48),
  new PartialRefundPolicy(24, 48, 0.5),
  new NoRefundPolicy(),
];

export class RefundPolicySelector {
  constructor(private readonly policies: RefundPolicy[] = DEFAULT_POLICIES) {}

  select(hoursUntilShow: number): RefundPolicy {
    const policy = this.policies.find((p) => p.appliesTo(hoursUntilShow));
    if (!policy) {
      throw new Error('No refund policy matched — DEFAULT_POLICIES must include a catch-all');
    }
    return policy;
  }
}
