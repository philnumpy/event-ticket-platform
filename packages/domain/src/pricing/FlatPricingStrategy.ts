import { Money } from '../shared/Money';
import { PricingContext, PricingStrategy } from './PricingStrategy';

/** The default: charge exactly the show's configured base price. */
export class FlatPricingStrategy implements PricingStrategy {
  readonly name = 'FLAT';

  price(ctx: PricingContext): Money {
    return ctx.basePrice;
  }
}
