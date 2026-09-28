import { Event, Money, Seat, Show, ShowSeat, Venue } from '@etp/domain';
import { TestApp } from './testApp';

export async function seedShow(
  app: Pick<TestApp, 'venues' | 'seats' | 'events' | 'shows' | 'showSeats'>,
  opts: { showId: string; seatIds: string[]; startOffsetHours?: number },
): Promise<{ venueId: string; eventId: string }> {
  const venueId = `venue-${opts.showId}`;
  const eventId = `event-${opts.showId}`;
  const startOffsetHours = opts.startOffsetHours ?? 72;

  await app.venues.save(new Venue({ id: venueId, name: 'Test Venue', city: 'Delhi', address: 'MG Road' }));
  await app.seats.saveMany(
    opts.seatIds.map(
      (id, i) => new Seat({ id, venueId, section: 'A', row: 'A', seatNumber: i + 1, tier: 'GOLD' }),
    ),
  );
  await app.events.save(new Event({ id: eventId, title: 'Test Event', genre: 'DRAMA', durationMinutes: 100 }));
  await app.shows.save(
    new Show({
      id: opts.showId,
      eventId,
      venueId,
      startTime: new Date(Date.now() + startOffsetHours * 3_600_000),
      endTime: new Date(Date.now() + (startOffsetHours + 2) * 3_600_000),
      basePriceByTier: { GOLD: Money.of(50000) },
    }),
  );
  await app.showSeats.saveMany(opts.seatIds.map((seatId) => new ShowSeat({ showId: opts.showId, seatId })));

  return { venueId, eventId };
}
