import { Money, SeatTier } from '@etp/domain';

/**
 * The platform is single-currency for now (Phase 2 scope decision — a real
 * multi-currency platform would add a `currency` column per Venue/Show).
 * Kept in one place so that decision is easy to revisit later.
 */
export const DEFAULT_CURRENCY = 'INR';

export function toPriceMap(json: unknown, currency: string = DEFAULT_CURRENCY): Partial<Record<SeatTier, Money>> {
  const raw = (json ?? {}) as Record<string, number>;
  const result: Partial<Record<SeatTier, Money>> = {};
  for (const [tier, minorUnits] of Object.entries(raw)) {
    result[tier as SeatTier] = Money.of(minorUnits, currency);
  }
  return result;
}

export function fromPriceMap(prices: Partial<Record<SeatTier, Money>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [tier, money] of Object.entries(prices)) {
    if (money) {
      result[tier] = money.amount;
    }
  }
  return result;
}
