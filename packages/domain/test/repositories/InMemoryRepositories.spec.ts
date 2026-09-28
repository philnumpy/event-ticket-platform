import { InMemoryVenueRepository } from '../../src/repositories/in-memory/InMemoryVenueRepository';
import { InMemoryEventCatalogRepository } from '../../src/repositories/in-memory/InMemoryEventCatalogRepository';
import { InMemoryShowRepository } from '../../src/repositories/in-memory/InMemoryShowRepository';
import { InMemoryBookingRepository } from '../../src/repositories/in-memory/InMemoryBookingRepository';
import { InMemoryPaymentRepository } from '../../src/repositories/in-memory/InMemoryPaymentRepository';
import { InMemoryHoldRepository } from '../../src/repositories/in-memory/InMemoryHoldRepository';
import { Venue } from '../../src/entities/Venue';
import { Event } from '../../src/entities/Event';
import { Show } from '../../src/entities/Show';
import { Booking } from '../../src/entities/Booking';
import { Payment } from '../../src/entities/Payment';
import { Hold } from '../../src/entities/Hold';
import { Money } from '../../src/shared/Money';

describe('InMemoryShowRepository', () => {
  it('filters search results by city and genre, joining across Venue and Event', async () => {
    const venues = new InMemoryVenueRepository();
    const events = new InMemoryEventCatalogRepository();
    const shows = new InMemoryShowRepository(venues, events);

    await venues.save(new Venue({ id: 'v1', name: 'PVR', city: 'Delhi', address: 'x' }));
    await venues.save(new Venue({ id: 'v2', name: 'INOX', city: 'Mumbai', address: 'y' }));
    await events.save(new Event({ id: 'e1', title: 'Movie A', genre: 'ACTION', durationMinutes: 120 }));
    await events.save(new Event({ id: 'e2', title: 'Movie B', genre: 'COMEDY', durationMinutes: 100 }));

    await shows.save(
      new Show({
        id: 'show-delhi-action',
        eventId: 'e1',
        venueId: 'v1',
        startTime: new Date('2026-06-01T18:00:00Z'),
        endTime: new Date('2026-06-01T20:00:00Z'),
        basePriceByTier: { GOLD: Money.of(50000) },
      }),
    );
    await shows.save(
      new Show({
        id: 'show-mumbai-comedy',
        eventId: 'e2',
        venueId: 'v2',
        startTime: new Date('2026-06-02T18:00:00Z'),
        endTime: new Date('2026-06-02T20:00:00Z'),
        basePriceByTier: { GOLD: Money.of(30000) },
      }),
    );

    expect((await shows.search({ city: 'Delhi' })).map((s) => s.id)).toEqual(['show-delhi-action']);
    expect((await shows.search({ genre: 'COMEDY' })).map((s) => s.id)).toEqual(['show-mumbai-comedy']);
    expect((await shows.search({})).length).toBe(2);
    expect((await shows.search({ city: 'Delhi', genre: 'COMEDY' })).length).toBe(0);
  });

  it('filters by date range', async () => {
    const venues = new InMemoryVenueRepository();
    const events = new InMemoryEventCatalogRepository();
    const shows = new InMemoryShowRepository(venues, events);
    await shows.save(
      new Show({
        id: 'early',
        eventId: 'e1',
        venueId: 'v1',
        startTime: new Date('2026-01-01T00:00:00Z'),
        endTime: new Date('2026-01-01T02:00:00Z'),
        basePriceByTier: {},
      }),
    );

    expect(await shows.search({ dateFrom: new Date('2026-02-01T00:00:00Z') })).toHaveLength(0);
    expect(await shows.search({ dateTo: new Date('2025-12-31T00:00:00Z') })).toHaveLength(0);
    expect(await shows.search({ dateFrom: new Date('2025-01-01T00:00:00Z') })).toHaveLength(1);
  });
});

describe('InMemoryBookingRepository', () => {
  it('finds a booking by its holdId', async () => {
    const repo = new InMemoryBookingRepository();
    const booking = new Booking({
      id: 'b1',
      userId: 'u1',
      showId: 's1',
      seatIds: ['seat-1'],
      amount: Money.of(1000),
      createdAt: new Date(),
      holdId: 'hold-1',
    });
    await repo.save(booking);

    expect((await repo.findByHoldId('hold-1'))?.id).toBe('b1');
    expect(await repo.findByHoldId('nonexistent')).toBeNull();
  });

  it('counts recent bookings within the lookback window', async () => {
    const repo = new InMemoryBookingRepository();
    const now = Date.now();
    await repo.save(
      new Booking({
        id: 'recent',
        userId: 'u1',
        showId: 's1',
        seatIds: ['seat-1'],
        amount: Money.of(1000),
        createdAt: new Date(now - 1000),
      }),
    );
    await repo.save(
      new Booking({
        id: 'old',
        userId: 'u1',
        showId: 's1',
        seatIds: ['seat-2'],
        amount: Money.of(1000),
        createdAt: new Date(now - 20 * 60_000),
      }),
    );

    expect(await repo.countRecentByUserAndShow('u1', 's1', 10)).toBe(1);
  });
});

describe('InMemoryHoldRepository', () => {
  it('finds only ACTIVE holds past their expiry across all shows', async () => {
    const repo = new InMemoryHoldRepository();
    const now = new Date('2026-01-01T00:10:00Z');
    const expiredActive = new Hold({
      id: 'h1',
      showId: 's1',
      seatIds: ['seat-1'],
      userId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ttlSeconds: 300,
    });
    const stillActive = new Hold({
      id: 'h2',
      showId: 's2',
      seatIds: ['seat-2'],
      userId: 'u1',
      createdAt: new Date('2026-01-01T00:09:00Z'),
      ttlSeconds: 300,
    });
    const expiredButAlreadyConsumed = new Hold({
      id: 'h3',
      showId: 's3',
      seatIds: ['seat-3'],
      userId: 'u1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ttlSeconds: 300,
    });
    expiredButAlreadyConsumed.consume();

    await repo.save(expiredActive);
    await repo.save(stillActive);
    await repo.save(expiredButAlreadyConsumed);

    const expired = await repo.findExpiredActive(now);
    expect(expired.map((h) => h.id)).toEqual(['h1']);
  });
});

describe('InMemoryPaymentRepository', () => {
  it('finds a payment by idempotency key', async () => {
    const repo = new InMemoryPaymentRepository();
    const payment = new Payment({
      id: 'p1',
      bookingId: 'b1',
      amount: Money.of(1000),
      idempotencyKey: 'idem-key-1',
      provider: 'MOCK',
      createdAt: new Date(),
    });
    await repo.save(payment);

    expect((await repo.findByIdempotencyKey('idem-key-1'))?.id).toBe('p1');
    expect(await repo.findByIdempotencyKey('unknown')).toBeNull();
  });

  it('claim() lets the first caller win and hands every later caller the same row', async () => {
    const repo = new InMemoryPaymentRepository();
    const first = new Payment({
      id: 'p1',
      bookingId: 'b1',
      amount: Money.of(1000),
      idempotencyKey: 'idem-key-2',
      provider: 'MOCK',
      createdAt: new Date(),
    });
    const duplicate = new Payment({
      id: 'p2',
      bookingId: 'b1',
      amount: Money.of(1000),
      idempotencyKey: 'idem-key-2',
      provider: 'MOCK',
      createdAt: new Date(),
    });

    const firstResult = await repo.claim(first);
    expect(firstResult).toEqual({ created: true, payment: first });

    const secondResult = await repo.claim(duplicate);
    expect(secondResult).toEqual({ created: false, payment: first });
  });
});
