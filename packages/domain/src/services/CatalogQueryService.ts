import { Money } from '../shared/Money';
import { ShowSeat } from '../entities/ShowSeat';
import { ShowRepository, ShowSearchFilters } from '../repositories/ShowRepository';
import { EventCatalogRepository } from '../repositories/EventCatalogRepository';
import { VenueRepository } from '../repositories/VenueRepository';
import { ShowSeatRepository } from '../repositories/ShowSeatRepository';

export interface ShowSummary {
  showId: string;
  eventTitle: string;
  genre: string;
  venueName: string;
  city: string;
  startTime: Date;
  availableSeatCount: number;
  totalSeatCount: number;
  priceRange: { min: Money; max: Money };
}

/**
 * Composes four single-aggregate repositories into the read models the
 * browse/search and seat-map use cases actually need. Kept as its own
 * service (rather than, say, a method on ShowRepository) because it's a
 * read-side concern that spans aggregates — exactly the boundary Phase 3
 * wraps with cache-aside, since these are the platform's highest-QPS reads.
 */
export class CatalogQueryService {
  constructor(
    private readonly shows: ShowRepository,
    private readonly events: EventCatalogRepository,
    private readonly venues: VenueRepository,
    private readonly showSeats: ShowSeatRepository,
  ) {}

  async browse(filters: ShowSearchFilters): Promise<ShowSummary[]> {
    const shows = await this.shows.search(filters);
    const summaries: ShowSummary[] = [];

    for (const show of shows) {
      const [event, venue, seats] = await Promise.all([
        this.events.findById(show.eventId),
        this.venues.findById(show.venueId),
        this.showSeats.findByShow(show.id),
      ]);
      if (!event || !venue) {
        continue;
      }

      const availableSeatCount = seats.filter((s) => s.status === 'AVAILABLE').length;
      const prices = Object.values(show.basePriceByTier).filter((m): m is Money => Boolean(m));
      const priceRange =
        prices.length > 0
          ? {
              min: prices.reduce((min, p) => (p.isGreaterThan(min) ? min : p)),
              max: prices.reduce((max, p) => (p.isGreaterThan(max) ? p : max)),
            }
          : { min: Money.zero(), max: Money.zero() };

      summaries.push({
        showId: show.id,
        eventTitle: event.title,
        genre: event.genre,
        venueName: venue.name,
        city: venue.city,
        startTime: show.startTime,
        availableSeatCount,
        totalSeatCount: seats.length,
        priceRange,
      });
    }

    return summaries;
  }

  async seatMap(showId: string): Promise<ShowSeat[]> {
    return this.showSeats.findByShow(showId);
  }
}
