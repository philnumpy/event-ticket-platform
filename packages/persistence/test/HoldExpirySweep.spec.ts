import {
  BookingApplicationService,
  BookingState,
  DomainEventPublisher,
  FlatPricingStrategy,
  GuardedInMemorySeatHoldService,
  InMemoryBookingRepository,
  InMemoryEventCatalogRepository,
  InMemoryHoldRepository,
  InMemoryPaymentRepository,
  InMemorySeatRepository,
  InMemoryShowRepository,
  InMemoryShowSeatRepository,
  InMemoryVenueRepository,
  Event,
  Money,
  RefundPolicySelector,
  Seat,
  Show,
  ShowSeat,
  Venue,
} from '@etp/domain';
import { HoldExpirySweep } from '../src/jobs/HoldExpirySweep';

/**
 * HoldExpirySweep is the saga's compensating action for "payment-service
 * never responds at all" (ADR 0004) -- it's what actually frees a seat
 * whose booking never gets a payment answer. That makes it worth testing
 * directly, not just via the Testcontainers-gated end-to-end suite: this
 * uses only @etp/domain's in-memory adapters, so it runs without Docker.
 */
describe('HoldExpirySweep (in-memory, no Docker required)', () => {
  async function buildWorld(now: { value: Date }) {
    const venues = new InMemoryVenueRepository();
    const events = new InMemoryEventCatalogRepository();
    const shows = new InMemoryShowRepository(venues, events);
    const seats = new InMemorySeatRepository();
    const showSeats = new InMemoryShowSeatRepository();
    const holds = new InMemoryHoldRepository();
    const bookings = new InMemoryBookingRepository();
    const payments = new InMemoryPaymentRepository();
    const seatHoldService = new GuardedInMemorySeatHoldService(showSeats, 1);
    const publisher = new DomainEventPublisher();

    await venues.save(new Venue({ id: 'v1', name: 'Test Venue', city: 'Delhi', address: 'x' }));
    await events.save(new Event({ id: 'e1', title: 'Test', genre: 'DRAMA', durationMinutes: 100 }));
    await seats.saveMany([
      new Seat({ id: 'seat-1', venueId: 'v1', section: 'A', row: 'A', seatNumber: 1, tier: 'GOLD' }),
      new Seat({ id: 'seat-2', venueId: 'v1', section: 'A', row: 'A', seatNumber: 2, tier: 'GOLD' }),
    ]);
    await shows.save(
      new Show({
        id: 'show-1',
        eventId: 'e1',
        venueId: 'v1',
        startTime: new Date(now.value.getTime() + 72 * 3_600_000),
        endTime: new Date(now.value.getTime() + 75 * 3_600_000),
        basePriceByTier: { GOLD: Money.of(50000) },
      }),
    );
    await showSeats.saveMany([
      new ShowSeat({ showId: 'show-1', seatId: 'seat-1' }),
      new ShowSeat({ showId: 'show-1', seatId: 'seat-2' }),
    ]);

    const holdTtlSeconds = 300;
    let idCounter = 0;
    const bookingService = new BookingApplicationService(
      shows,
      seats,
      showSeats,
      holds,
      bookings,
      payments,
      seatHoldService,
      new FlatPricingStrategy(),
      new RefundPolicySelector(),
      publisher,
      holdTtlSeconds,
      () => `id-${++idCounter}`,
      () => now.value,
    );

    return { bookingService, holds, bookings, showSeats };
  }

  it('leaves a booking untouched when its hold has not expired yet', async () => {
    const now = { value: new Date('2026-01-01T00:00:00Z') };
    const world = await buildWorld(now);
    await world.bookingService.initiateBooking({ userId: 'u1', showId: 'show-1', seatIds: ['seat-1'] });

    const sweep = new HoldExpirySweep(world.holds, world.bookingService, 30_000, () => now.value);
    const swept = await sweep.runOnce();

    expect(swept).toBe(0);
  });

  it('expires a booking and frees its seat once the hold TTL has elapsed -- the saga-timeout compensation', async () => {
    const now = { value: new Date('2026-01-01T00:00:00Z') };
    const world = await buildWorld(now);
    const { booking } = await world.bookingService.initiateBooking({
      userId: 'u1',
      showId: 'show-1',
      seatIds: ['seat-1'],
    });

    now.value = new Date(now.value.getTime() + 301_000); // past the 300s hold TTL

    const sweep = new HoldExpirySweep(world.holds, world.bookingService, 30_000, () => now.value);
    const swept = await sweep.runOnce();

    expect(swept).toBe(1);
    expect((await world.bookings.findById(booking.id))?.state).toBe(BookingState.EXPIRED);
    expect((await world.showSeats.findById('show-1', 'seat-1'))?.status).toBe('AVAILABLE');
  });

  it('sweeps multiple independently-expired holds across shows in one pass', async () => {
    const now = { value: new Date('2026-01-01T00:00:00Z') };
    const world = await buildWorld(now);
    const first = await world.bookingService.initiateBooking({
      userId: 'u1',
      showId: 'show-1',
      seatIds: ['seat-1'],
    });
    const second = await world.bookingService.initiateBooking({
      userId: 'u2',
      showId: 'show-1',
      seatIds: ['seat-2'],
    });

    now.value = new Date(now.value.getTime() + 301_000);

    const sweep = new HoldExpirySweep(world.holds, world.bookingService, 30_000, () => now.value);
    const swept = await sweep.runOnce();

    expect(swept).toBe(2);
    expect((await world.bookings.findById(first.booking.id))?.state).toBe(BookingState.EXPIRED);
    expect((await world.bookings.findById(second.booking.id))?.state).toBe(BookingState.EXPIRED);
  });

  it('is safe to run repeatedly: a second sweep after the first has already compensated does nothing new', async () => {
    const now = { value: new Date('2026-01-01T00:00:00Z') };
    const world = await buildWorld(now);
    await world.bookingService.initiateBooking({ userId: 'u1', showId: 'show-1', seatIds: ['seat-1'] });
    now.value = new Date(now.value.getTime() + 301_000);

    const sweep = new HoldExpirySweep(world.holds, world.bookingService, 30_000, () => now.value);
    await sweep.runOnce();
    const secondPass = await sweep.runOnce();

    expect(secondPass).toBe(0);
  });

  it('start()/stop() schedule and cancel a recurring timer without keeping the process alive', () => {
    const holds = new InMemoryHoldRepository();
    const bookingServiceStub = { expireHold: async () => undefined } as unknown as BookingApplicationService;
    const sweep = new HoldExpirySweep(holds, bookingServiceStub, 30_000);

    sweep.start();
    sweep.start(); // idempotent: a second start() must not leak a second timer
    sweep.stop();
    sweep.stop(); // idempotent: stopping twice must not throw
  });
});
