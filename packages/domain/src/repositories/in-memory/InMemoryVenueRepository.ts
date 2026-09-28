import { Venue } from '../../entities/Venue';
import { VenueRepository } from '../VenueRepository';

export class InMemoryVenueRepository implements VenueRepository {
  private readonly store = new Map<string, Venue>();

  async findById(id: string): Promise<Venue | null> {
    return this.store.get(id) ?? null;
  }

  async save(venue: Venue): Promise<void> {
    this.store.set(venue.id, venue);
  }
}
