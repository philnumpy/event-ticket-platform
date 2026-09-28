/**
 * A bookable "thing" (movie, concert, play). Named `Event` per the ticketing
 * domain's ubiquitous language — distinct from `DomainEvent` in ../events,
 * which represents something that happened in the system.
 */
export interface EventProps {
  id: string;
  title: string;
  genre: string;
  description?: string;
  durationMinutes: number;
}

export class Event {
  readonly id: string;
  readonly title: string;
  readonly genre: string;
  readonly description?: string;
  readonly durationMinutes: number;

  constructor(props: EventProps) {
    if (props.durationMinutes <= 0) {
      throw new Error('durationMinutes must be positive');
    }
    this.id = props.id;
    this.title = props.title;
    this.genre = props.genre;
    this.description = props.description;
    this.durationMinutes = props.durationMinutes;
  }
}
