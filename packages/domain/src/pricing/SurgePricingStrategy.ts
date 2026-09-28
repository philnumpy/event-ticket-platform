import { Money } from '../shared/Money';
import { PricingContext, PricingStrategy } from './PricingStrategy';

export interface SurgeThreshold {
  occupancy: number;
  multiplier: number;
}

const DEFAULT_THRESHOLDS: SurgeThreshold[] = [
  { occupancy: 0.9, multiplier: 1.5 },
  { occupancy: 0.75, multiplier: 1.25 },
];

/** Demand-based surcharge: the highest-occupancy threshold that the show has
 * crossed determines the multiplier applied to the base price. */
export class SurgePricingStrategy implements PricingStrategy {
  readonly name = 'SURGE';
  private readonly thresholds: SurgeThreshold[];

  constructor(thresholds: SurgeThreshold[] = DEFAULT_THRESHOLDS) {
    this.thresholds = [...thresholds].sort((a, b) => b.occupancy - a.occupancy);
  }

  price(ctx: PricingContext): Money {
    const matched = this.thresholds.find((t) => ctx.occupancyRatio >= t.occupancy);
    return matched ? ctx.basePrice.multiply(matched.multiplier) : ctx.basePrice;
  }
}
