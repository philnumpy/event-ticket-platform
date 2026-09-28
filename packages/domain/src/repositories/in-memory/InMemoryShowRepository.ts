import { Show } from '../../entities/Show';
import { ShowRepository, ShowSearchFilters } from '../ShowRepository';
import { VenueRepository } from '../VenueRepository';
import { EventCatalogRepository } from '../EventCatalogRepository';

export class InMemoryShowRepository implements ShowRepository {
  private readonly store = new Map<string, Show>();

  constructor(
    private readonly venues: VenueRepository,
    private readonly events: EventCatalogRepository,
  ) {}

  async findById(id: string): Promise<Show | null> {
    return this.store.get(id) ?? null;
  }

  async search(filters: ShowSearchFilters): Promise<Show[]> {
    const results: Show[] = [];
    for (const show of this.store.values()) {
      if (filters.dateFrom && show.startTime < filters.dateFrom) continue;
      if (filters.dateTo && show.startTime > filters.dateTo) continue;

      if (filters.city) {
        const venue = await this.venues.findById(show.venueId);
        if (!venue || venue.city !== filters.city) continue;
      }

      if (filters.genre) {
        const event = await this.events.findById(show.eventId);
        if (!event || event.genre !== filters.genre) continue;
      }

      results.push(show);
    }
    return results;
  }

  async save(show: Show): Promise<void> {
    this.store.set(show.id, show);
  }
}
