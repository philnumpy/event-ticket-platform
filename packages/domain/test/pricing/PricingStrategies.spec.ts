import { Money } from '../../src/shared/Money';
import { FlatPricingStrategy } from '../../src/pricing/FlatPricingStrategy';
import { SurgePricingStrategy } from '../../src/pricing/SurgePricingStrategy';
import { EarlyBirdDiscountStrategy } from '../../src/pricing/EarlyBirdDiscountStrategy';
import { PricingContext } from '../../src/pricing/PricingStrategy';

function ctx(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    basePrice: Money.of(10000),
    tier: 'GOLD',
    occupancyRatio: 0,
    hoursUntilShow: 100,
    ...overrides,
  };
}

describe('FlatPricingStrategy', () => {
  it('always returns the base price', () => {
    const strategy = new FlatPricingStrategy();
    expect(strategy.price(ctx({ occupancyRatio: 0.99, hoursUntilShow: 1 })).amount).toBe(10000);
  });
});

describe('SurgePricingStrategy', () => {
  const strategy = new SurgePricingStrategy();

  it('charges base price below the lowest threshold', () => {
    expect(strategy.price(ctx({ occupancyRatio: 0.5 })).amount).toBe(10000);
  });

  it('applies the 1.25x multiplier at the 0.75 threshold', () => {
    expect(strategy.price(ctx({ occupancyRatio: 0.75 })).amount).toBe(12500);
  });

  it('applies the 1.5x multiplier at the 0.9 threshold', () => {
    expect(strategy.price(ctx({ occupancyRatio: 0.9 })).amount).toBe(15000);
  });

  it('uses the highest matching threshold, not the first configured', () => {
    expect(strategy.price(ctx({ occupancyRatio: 0.95 })).amount).toBe(15000);
  });

  it('supports custom thresholds', () => {
    const custom = new SurgePricingStrategy([{ occupancy: 0.5, multiplier: 2 }]);
    expect(custom.price(ctx({ occupancyRatio: 0.6 })).amount).toBe(20000);
  });
});

describe('EarlyBirdDiscountStrategy', () => {
  const strategy = new EarlyBirdDiscountStrategy(168, 0.15);

  it('applies the discount at or beyond the threshold', () => {
    expect(strategy.price(ctx({ hoursUntilShow: 168 })).amount).toBe(8500);
    expect(strategy.price(ctx({ hoursUntilShow: 200 })).amount).toBe(8500);
  });

  it('charges full price just under the threshold', () => {
    expect(strategy.price(ctx({ hoursUntilShow: 167 })).amount).toBe(10000);
  });
});
