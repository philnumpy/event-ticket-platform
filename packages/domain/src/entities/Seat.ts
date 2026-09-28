import { SeatTier } from './Venue';

export interface SeatProps {
  id: string;
  venueId: string;
  section: string;
  row: string;
  seatNumber: number;
  tier: SeatTier;
}

export class Seat {
  readonly id: string;
  readonly venueId: string;
  readonly section: string;
  readonly row: string;
  readonly seatNumber: number;
  readonly tier: SeatTier;

  constructor(props: SeatProps) {
    this.id = props.id;
    this.venueId = props.venueId;
    this.section = props.section;
    this.row = props.row;
    this.seatNumber = props.seatNumber;
    this.tier = props.tier;
  }

  get label(): string {
    return `${this.section}-${this.row}${this.seatNumber}`;
  }
}
