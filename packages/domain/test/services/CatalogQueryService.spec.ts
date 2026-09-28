import { CatalogQueryService } from '../../src/services/CatalogQueryService';
import { InMemoryShowRepository } from '../../src/repositories/in-memory/InMemoryShowRepository';
import { InMemoryEventCatalogRepository } from '../../src/repositories/in-memory/InMemoryEventCatalogRepository';
import { InMemoryVenueRepository } from '../../src/repositories/in-memory/InMemoryVenueRepository';
import { InMemoryShowSeatRepository } from '../../src/repositories/in-memory/InMemoryShowSeatRepository';
import { Venue } from '../../src/entities/Venue';
import { Event } from '../../src/entities/Event';
import { Show } from '../../src/entities/Show';
import { ShowSeat } from '../../src/entities/ShowSeat';
import { Money } from '../../src/shared/Money';

describe('CatalogQueryService', () => {
  async function setup() {
    const venues = new InMemoryVenueRepository();
    const events = new InMemoryEventCatalogRepository();
    const shows = new InMemoryShowRepository(venues, events);
    const showSeats = new InMemoryShowSeatRepository();
    const catalog = new CatalogQueryService(shows, events, venues, showSeats);

    await venues.save(new Venue({ id: 'v1', name: 'PVR Saket', city: 'Delhi', address: 'Saket' }));
    await events.save(new Event({ id: 'e1', title: 'Dune 3', genre: 'SCI_FI', durationMinutes: 150 }));
    await shows.save(
      new Show({
        id: 'show-1',
        eventId: 'e1',
        venueId: 'v1',
        startTime: new Date('2026-06-01T18:00:00Z'),
        endTime: new Date('2026-06-01T20:30:00Z'),
        basePriceByTier: { GOLD: Money.of(50000), SILVER: Money.of(30000) },
      }),
    );
    await showSeats.saveMany([
      new ShowSeat({ showId: 'show-1', seatId: 'seat-1' }),
      new ShowSeat({ showId: 'show-1', seatId: 'seat-2', status: 'BOOKED', holdId: 'h1' }),
      new ShowSeat({ showId: 'show-1', seatId: 'seat-3', status: 'HELD', holdId: 'h2' }),
    ]);

    return { catalog, shows, events, venues, showSeats };
  }

  it('browse() composes Show + Event + Venue + inventory into a summary', async () => {
    const { catalog } = await setup();
    const results = await catalog.browse({ city: 'Delhi' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      showId: 'show-1',
      eventTitle: 'Dune 3',
      genre: 'SCI_FI',
      venueName: 'PVR Saket',
      city: 'Delhi',
      availableSeatCount: 1,
      totalSeatCount: 3,
    });
    expect(results[0]?.priceRange.min.amount).toBe(30000);
    expect(results[0]?.priceRange.max.amount).toBe(50000);
  });

  it('browse() skips shows whose Event or Venue cannot be found (data integrity guard)', async () => {
    const { catalog, shows } = await setup();
    await shows.save(
      new Show({
        id: 'orphan-show',
        eventId: 'nonexistent-event',
        venueId: 'v1',
        startTime: new Date('2026-06-02T18:00:00Z'),
        endTime: new Date('2026-06-02T20:00:00Z'),
        basePriceByTier: {},
      }),
    );

    const results = await catalog.browse({});
    expect(results.map((r) => r.showId)).not.toContain('orphan-show');
  });

  it('browse() defaults price range to zero when a show has no configured prices', async () => {
    const { catalog, shows } = await setup();
    await shows.save(
      new Show({
        id: 'free-show',
        eventId: 'e1',
        venueId: 'v1',
        startTime: new Date('2026-06-03T18:00:00Z'),
        endTime: new Date('2026-06-03T20:00:00Z'),
        basePriceByTier: {},
      }),
    );

    const result = (await catalog.browse({})).find((r) => r.showId === 'free-show');
    expect(result?.priceRange.min.amount).toBe(0);
    expect(result?.priceRange.max.amount).toBe(0);
  });

  it('seatMap() returns the raw per-seat inventory for a show', async () => {
    const { catalog } = await setup();
    const seatMap = await catalog.seatMap('show-1');
    expect(seatMap).toHaveLength(3);
    expect(seatMap.map((s) => s.status).sort()).toEqual(['AVAILABLE', 'BOOKED', 'HELD']);
  });
});
