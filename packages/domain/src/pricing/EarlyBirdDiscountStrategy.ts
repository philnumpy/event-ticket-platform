import { Money } from '../shared/Money';
import { PricingContext, PricingStrategy } from './PricingStrategy';

/** Rewards booking well ahead of the show with a flat percentage discount. */
export class EarlyBirdDiscountStrategy implements PricingStrategy {
  readonly name = 'EARLY_BIRD';

  constructor(
    private readonly minHoursAhead = 168, // 7 days
    private readonly discount = 0.15,
  ) {}

  price(ctx: PricingContext): Money {
    if (ctx.hoursUntilShow >= this.minHoursAhead) {
      return ctx.basePrice.multiply(1 - this.discount);
    }
    return ctx.basePrice;
  }
}
