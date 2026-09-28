import { BookingApplicationService } from '../../src/services/BookingApplicationService';
import { GuardedInMemorySeatHoldService } from '../../src/services/GuardedInMemorySeatHoldService';
import { InMemoryShowRepository } from '../../src/repositories/in-memory/InMemoryShowRepository';
import { InMemorySeatRepository } from '../../src/repositories/in-memory/InMemorySeatRepository';
import { InMemoryShowSeatRepository } from '../../src/repositories/in-memory/InMemoryShowSeatRepository';
import { InMemoryHoldRepository } from '../../src/repositories/in-memory/InMemoryHoldRepository';
import { InMemoryBookingRepository } from '../../src/repositories/in-memory/InMemoryBookingRepository';
import { InMemoryPaymentRepository } from '../../src/repositories/in-memory/InMemoryPaymentRepository';
import { InMemoryVenueRepository } from '../../src/repositories/in-memory/InMemoryVenueRepository';
import { InMemoryEventCatalogRepository } from '../../src/repositories/in-memory/InMemoryEventCatalogRepository';
import { FlatPricingStrategy } from '../../src/pricing/FlatPricingStrategy';
import { RefundPolicySelector } from '../../src/refund/RefundPolicySelector';
import { DomainEventPublisher } from '../../src/events/DomainEventPublisher';
import { NotificationDispatcher } from '../../src/events/NotificationDispatcher';
import { Venue } from '../../src/entities/Venue';
import { Event } from '../../src/entities/Event';
import { Show } from '../../src/entities/Show';
import { Seat } from '../../src/entities/Seat';
import { ShowSeat } from '../../src/entities/ShowSeat';
import { Money } from '../../src/shared/Money';
import { BookingState } from '../../src/booking/BookingState';
import {
  SeatNotAvailableError,
  HoldExpiredError,
  TooManySeatsError,
  NotFoundError,
} from '../../src/errors/DomainErrors';

const SHOW_ID = 'show-1';
const SEAT_1 = 'seat-1';
const SEAT_2 = 'seat-2';
const USER = 'user-1';

interface World {
  service: BookingApplicationService;
  seats: InMemorySeatRepository;
  showSeats: InMemoryShowSeatRepository;
  bookings: InMemoryBookingRepository;
  publisher: DomainEventPublisher;
  dispatcher: NotificationDispatcher;
  holdTtlSeconds: number;
  clock: { now: Date };
}

function buildWorld(opts: { showStartOffsetHours: number; holdTtlSeconds?: number }): World {
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
  const dispatcher = new NotificationDispatcher();
  dispatcher.register(publisher);

  const clock = { now: new Date('2026-01-01T00:00:00Z') };

  void venues.save(new Venue({ id: 'venue-1', name: 'PVR', city: 'Delhi', address: 'MG Road' }));
  void events.save(new Event({ id: 'event-1', title: 'Dune 3', genre: 'SCI_FI', durationMinutes: 150 }));
  void seats.saveMany([
    new Seat({ id: SEAT_1, venueId: 'venue-1', section: 'A', row: 'A', seatNumber: 1, tier: 'GOLD' }),
    new Seat({ id: SEAT_2, venueId: 'venue-1', section: 'A', row: 'A', seatNumber: 2, tier: 'GOLD' }),
  ]);
  void shows.save(
    new Show({
      id: SHOW_ID,
      eventId: 'event-1',
      venueId: 'venue-1',
      startTime: new Date(clock.now.getTime() + opts.showStartOffsetHours * 3_600_000),
      endTime: new Date(clock.now.getTime() + (opts.showStartOffsetHours + 2) * 3_600_000),
      basePriceByTier: { GOLD: Money.of(50000) },
    }),
  );
  void showSeats.saveMany([
    new ShowSeat({ showId: SHOW_ID, seatId: SEAT_1 }),
    new ShowSeat({ showId: SHOW_ID, seatId: SEAT_2 }),
  ]);

  const holdTtlSeconds = opts.holdTtlSeconds ?? 300;
  let idCounter = 0;

  const service = new BookingApplicationService(
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
    () => clock.now,
  );

  return { service, seats, showSeats, bookings, publisher, dispatcher, holdTtlSeconds, clock };
}

describe('BookingApplicationService', () => {
  it('walks the full happy path: initiate -> pay -> confirmed, and notifies the user', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });

    const { booking, hold } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });
    expect(booking.state).toBe(BookingState.HELD);
    expect(booking.amount.amount).toBe(50000);

    const showSeatAfterHold = await world.showSeats.findById(SHOW_ID, SEAT_1);
    expect(showSeatAfterHold?.status).toBe('HELD');

    const payment = await world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-1');
    expect(payment.status).toBe('SUCCESS');

    const confirmed = await world.bookings.findById(booking.id);
    expect(confirmed?.state).toBe(BookingState.CONFIRMED);

    const showSeatAfterConfirm = await world.showSeats.findById(SHOW_ID, SEAT_1);
    expect(showSeatAfterConfirm?.status).toBe('BOOKED');
    expect(showSeatAfterConfirm?.holdId).toBe(hold.id);

    expect(world.dispatcher.sent).toContainEqual(
      expect.objectContaining({ channel: 'EMAIL', to: USER }),
    );
  });

  it('rejects a second booking attempt for a seat already held by someone else', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    await world.service.initiateBooking({ userId: USER, showId: SHOW_ID, seatIds: [SEAT_1] });

    await expect(
      world.service.initiateBooking({ userId: 'user-2', showId: SHOW_ID, seatIds: [SEAT_1] }),
    ).rejects.toThrow(SeatNotAvailableError);
  });

  it('rejects bookings over the max-seats-per-booking limit even when all seats exist and are available', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const tooMany = Array.from({ length: 11 }, (_, i) => `extra-seat-${i}`);
    await world.seats.saveMany(
      tooMany.map(
        (id) => new Seat({ id, venueId: 'venue-1', section: 'B', row: 'B', seatNumber: 1, tier: 'GOLD' }),
      ),
    );
    await world.showSeats.saveMany(tooMany.map((id) => new ShowSeat({ showId: SHOW_ID, seatId: id })));

    await expect(
      world.service.initiateBooking({ userId: USER, showId: SHOW_ID, seatIds: tooMany }),
    ).rejects.toThrow(TooManySeatsError);
  });

  it('rejects a booking that references a seat with no inventory row for this show', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    await world.seats.saveMany([
      new Seat({ id: 'seat-no-inventory', venueId: 'venue-1', section: 'C', row: 'C', seatNumber: 1, tier: 'GOLD' }),
    ]);
    // Deliberately no matching ShowSeat row for SHOW_ID.

    await expect(
      world.service.initiateBooking({ userId: USER, showId: SHOW_ID, seatIds: ['seat-no-inventory'] }),
    ).rejects.toThrow(NotFoundError);
  });

  it('releases the seat and cancels the booking on payment failure', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    const payment = await world.service.confirmPayment(booking.id, 'FAILED', 'idem-2');
    expect(payment.status).toBe('FAILED');

    const cancelled = await world.bookings.findById(booking.id);
    expect(cancelled?.state).toBe(BookingState.CANCELLED);
    expect(cancelled?.isTerminal()).toBe(true); // no payment was ever captured

    const seat = await world.showSeats.findById(SHOW_ID, SEAT_1);
    expect(seat?.status).toBe('AVAILABLE');

    // The now-freed seat can be booked by someone else.
    await expect(
      world.service.initiateBooking({ userId: 'user-2', showId: SHOW_ID, seatIds: [SEAT_1] }),
    ).resolves.toBeDefined();
  });

  it('releases the seat and cancels the booking on a payment gateway timeout', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    const payment = await world.service.confirmPayment(booking.id, 'TIMEOUT', 'idem-timeout');
    expect(payment.status).toBe('TIMEOUT');

    const cancelled = await world.bookings.findById(booking.id);
    expect(cancelled?.state).toBe(BookingState.CANCELLED);
  });

  it('treats a duplicate payment callback (same idempotency key) as a no-op replay', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    const first = await world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-key-x');
    const second = await world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-key-x');

    expect(second.id).toBe(first.id);

    const confirmed = await world.bookings.findById(booking.id);
    expect(confirmed?.state).toBe(BookingState.CONFIRMED); // not double-processed
  });

  it('expires a hold that outlives its TTL and rejects a late payment confirmation', async () => {
    const world = buildWorld({ showStartOffsetHours: 72, holdTtlSeconds: 300 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    world.clock.now = new Date(world.clock.now.getTime() + 301_000);

    await expect(world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-3')).rejects.toThrow(
      HoldExpiredError,
    );

    const expired = await world.bookings.findById(booking.id);
    expect(expired?.state).toBe(BookingState.EXPIRED);

    const seat = await world.showSeats.findById(SHOW_ID, SEAT_1);
    expect(seat?.status).toBe('AVAILABLE');
  });

  it('applies the finalization-failure compensating path: paid but seat corrupted -> CANCELLED, then refundable', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking, hold } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    // Simulate external corruption: something else marked the seat BOOKED
    // under a different hold between our hold and our payment confirmation.
    await world.showSeats.save(
      new ShowSeat({ showId: SHOW_ID, seatId: SEAT_1, status: 'BOOKED', holdId: 'someone-elses-hold' }),
    );
    void hold;

    const payment = await world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-4');
    expect(payment.status).toBe('SUCCESS'); // money was captured

    const afterFinalizeFailure = await world.bookings.findById(booking.id);
    expect(afterFinalizeFailure?.state).toBe(BookingState.CANCELLED);
    expect(afterFinalizeFailure?.isTerminal()).toBe(false); // refund still owed, not just abandoned
  });

  it('cancels a HELD (pre-payment) booking with no refund owed', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    const refund = await world.service.cancelBooking(booking.id);
    expect(refund.isZero()).toBe(true);

    const cancelled = await world.bookings.findById(booking.id);
    expect(cancelled?.state).toBe(BookingState.CANCELLED);

    const seat = await world.showSeats.findById(SHOW_ID, SEAT_1);
    expect(seat?.status).toBe('AVAILABLE');
  });

  it('cancels a CONFIRMED booking with a full refund when far enough from the show', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 }); // > 48h away
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });
    await world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-5');

    const refund = await world.service.cancelBooking(booking.id);
    expect(refund.amount).toBe(50000);

    const finalBooking = await world.bookings.findById(booking.id);
    expect(finalBooking?.state).toBe(BookingState.REFUNDED);
  });

  it('cancels a CONFIRMED booking with NO refund when too close to the show', async () => {
    const world = buildWorld({ showStartOffsetHours: 10 }); // < 24h away
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });
    await world.service.confirmPayment(booking.id, 'SUCCESS', 'idem-6');

    const refund = await world.service.cancelBooking(booking.id);
    expect(refund.isZero()).toBe(true);

    const finalBooking = await world.bookings.findById(booking.id);
    expect(finalBooking?.state).toBe(BookingState.REFUNDED); // "refunded" $0, still processed
  });

  it('getBooking returns the booking by id', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    const fetched = await world.service.getBooking(booking.id);
    expect(fetched.id).toBe(booking.id);
  });

  it('getBooking throws NotFoundError for an unknown id', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    await expect(world.service.getBooking('nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('prices a multi-seat booking as the sum of each seat', async () => {
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1, SEAT_2],
    });
    expect(booking.amount.amount).toBe(100000);
  });

  it('processes exactly once when 20 concurrent duplicate payment callbacks share one idempotency key', async () => {
    // Mirrors the seat-hold concurrency proof, but for the idempotency-key
    // claim path: this is the "payment gateway sends duplicate callbacks"
    // requirement, and it must not double-process or double-confirm.
    const world = buildWorld({ showStartOffsetHours: 72 });
    const { booking } = await world.service.initiateBooking({
      userId: USER,
      showId: SHOW_ID,
      seatIds: [SEAT_1],
    });

    const CALLBACKS = 20;
    const results = await Promise.all(
      Array.from({ length: CALLBACKS }, () =>
        world.service.confirmPayment(booking.id, 'SUCCESS', 'shared-idem-key'),
      ),
    );

    const uniquePaymentIds = new Set(results.map((p) => p.id));
    expect(uniquePaymentIds.size).toBe(1);
    expect(results.every((p) => p.status === 'SUCCESS')).toBe(true);

    const finalBooking = await world.bookings.findById(booking.id);
    expect(finalBooking?.state).toBe(BookingState.CONFIRMED); // not corrupted by the race

    const seat = await world.showSeats.findById(SHOW_ID, SEAT_1);
    expect(seat?.status).toBe('BOOKED');
  });
});
