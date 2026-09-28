export type SeatTier = 'PLATINUM' | 'GOLD' | 'SILVER';

export interface VenueProps {
  id: string;
  name: string;
  city: string;
  address: string;
}

export class Venue {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly address: string;

  constructor(props: VenueProps) {
    this.id = props.id;
    this.name = props.name;
    this.city = props.city;
    this.address = props.address;
  }
}
