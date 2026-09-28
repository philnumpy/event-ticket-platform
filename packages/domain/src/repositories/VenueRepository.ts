import { Venue } from '../entities/Venue';

export interface VenueRepository {
  findById(id: string): Promise<Venue | null>;
  save(venue: Venue): Promise<void>;
}
