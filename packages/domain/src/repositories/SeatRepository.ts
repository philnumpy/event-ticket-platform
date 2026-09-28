import { Seat } from '../entities/Seat';

export interface SeatRepository {
  findById(id: string): Promise<Seat | null>;
  findByIds(ids: string[]): Promise<Seat[]>;
  findByVenue(venueId: string): Promise<Seat[]>;
  saveMany(seats: Seat[]): Promise<void>;
}
