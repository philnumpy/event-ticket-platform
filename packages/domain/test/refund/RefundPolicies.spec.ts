import { Money } from '../../src/shared/Money';
import { FullRefundPolicy } from '../../src/refund/FullRefundPolicy';
import { PartialRefundPolicy } from '../../src/refund/PartialRefundPolicy';
import { NoRefundPolicy } from '../../src/refund/NoRefundPolicy';
import { RefundPolicySelector } from '../../src/refund/RefundPolicySelector';

const amountPaid = Money.of(20000);

describe('FullRefundPolicy', () => {
  const policy = new FullRefundPolicy(48);

  it('applies at or beyond the threshold', () => {
    expect(policy.appliesTo(48)).toBe(true);
    expect(policy.appliesTo(72)).toBe(true);
  });

  it('does not apply below the threshold', () => {
    expect(policy.appliesTo(47.9)).toBe(false);
  });

  it('refunds the full amount', () => {
    expect(policy.calculateRefund({ amountPaid, hoursUntilShow: 72 }).amount).toBe(20000);
  });
});

describe('PartialRefundPolicy', () => {
  const policy = new PartialRefundPolicy(24, 48, 0.5);

  it('applies within [min, max)', () => {
    expect(policy.appliesTo(24)).toBe(true);
    expect(policy.appliesTo(47.9)).toBe(true);
  });

  it('does not apply outside the window', () => {
    expect(policy.appliesTo(23.9)).toBe(false);
    expect(policy.appliesTo(48)).toBe(false);
  });

  it('refunds the configured fraction', () => {
    expect(policy.calculateRefund({ amountPaid, hoursUntilShow: 30 }).amount).toBe(10000);
  });
});

describe('NoRefundPolicy', () => {
  const policy = new NoRefundPolicy();

  it('always applies (catch-all)', () => {
    expect(policy.appliesTo(0)).toBe(true);
    expect(policy.appliesTo(-5)).toBe(true);
  });

  it('refunds zero, preserving currency', () => {
    const refund = policy.calculateRefund({ amountPaid, hoursUntilShow: 1 });
    expect(refund.amount).toBe(0);
    expect(refund.currencyCode).toBe('INR');
  });
});

describe('RefundPolicySelector', () => {
  const selector = new RefundPolicySelector();

  it('picks FullRefundPolicy at >= 48h', () => {
    expect(selector.select(50).name).toBe('FULL_REFUND');
  });

  it('picks PartialRefundPolicy between 24h and 48h', () => {
    expect(selector.select(30).name).toBe('PARTIAL_REFUND');
  });

  it('picks NoRefundPolicy under 24h', () => {
    expect(selector.select(10).name).toBe('NO_REFUND');
  });

  it('throws if no configured policy matches (misconfiguration)', () => {
    const brokenSelector = new RefundPolicySelector([new FullRefundPolicy(48)]);
    expect(() => brokenSelector.select(1)).toThrow('No refund policy matched');
  });
});
