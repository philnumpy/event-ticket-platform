import { SeatTier } from './Venue';
import { Money } from '../shared/Money';

export type ShowStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';

export interface ShowProps {
  id: string;
  eventId: string;
  venueId: string;
  startTime: Date;
  endTime: Date;
  basePriceByTier: Partial<Record<SeatTier, Money>>;
  status?: ShowStatus;
}

/** A single screening/performance of an Event at a Venue at a specific time. */
export class Show {
  readonly id: string;
  readonly eventId: string;
  readonly venueId: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly basePriceByTier: Partial<Record<SeatTier, Money>>;
  private _status: ShowStatus;

  constructor(props: ShowProps) {
    if (props.endTime <= props.startTime) {
      throw new Error('Show endTime must be after startTime');
    }
    this.id = props.id;
    this.eventId = props.eventId;
    this.venueId = props.venueId;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.basePriceByTier = props.basePriceByTier;
    this._status = props.status ?? 'SCHEDULED';
  }

  get status(): ShowStatus {
    return this._status;
  }

  cancel(): void {
    this._status = 'CANCELLED';
  }

  basePriceFor(tier: SeatTier): Money {
    const price = this.basePriceByTier[tier];
    if (!price) {
      throw new Error(`No base price configured for tier "${tier}" on show "${this.id}"`);
    }
    return price;
  }

  hoursUntilStart(from: Date = new Date()): number {
    return (this.startTime.getTime() - from.getTime()) / (1000 * 60 * 60);
  }
}
