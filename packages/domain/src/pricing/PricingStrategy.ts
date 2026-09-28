import { Money } from '../shared/Money';
import { SeatTier } from '../entities/Venue';

export interface PricingContext {
  basePrice: Money;
  tier: SeatTier;
  /** Fraction of the show's seats already HELD or BOOKED, in [0, 1]. */
  occupancyRatio: number;
  hoursUntilShow: number;
}

export interface PricingStrategy {
  readonly name: string;
  price(ctx: PricingContext): Money;
}
