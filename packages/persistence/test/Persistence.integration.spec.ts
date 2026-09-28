import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import type Redis from 'ioredis';
import IORedis from 'ioredis';
import {
  Booking,
  BookingApplicationService,
  BookingState,
  DomainEventPublisher,
  Event,
  FlatPricingStrategy,
  Hold,
  Money,
  Payment,
  RefundPolicySelector,
  Seat,
  SeatNotAvailableError,
  Show,
  ShowSeat,
  Venue,
} from '@etp/domain';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../src/prisma/client';
import { PrismaVenueRepository } from '../src/repositories/PrismaVenueRepository';
import { PrismaSeatRepository } from '../src/repositories/PrismaSeatRepository';
import { PrismaEventCatalogRepository } from '../src/repositories/PrismaEventCatalogRepository';
import { PrismaShowRepository } from '../src/repositories/PrismaShowRepository';
import { PrismaShowSeatRepository } from '../src/repositories/PrismaShowSeatRepository';
import { PrismaHoldRepository } from '../src/repositories/PrismaHoldRepository';
import { PrismaBookingRepository } from '../src/repositories/PrismaBookingRepository';
import { PrismaPaymentRepository } from '../src/repositories/PrismaPaymentRepository';
import { RedisSeatHoldService } from '../src/redis/RedisSeatHoldService';
import { HoldExpirySweep } from '../src/jobs/HoldExpirySweep';

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma');

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let prisma: PrismaClient;
let redis: Redis;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  const databaseUrl = postgres.getConnectionUri();
  execSync(`npx prisma db push --schema=${SCHEMA_PATH} --skip-generate`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  prisma = createPrismaClient(databaseUrl);
  redis = new IORedis(redisContainer.getConnectionUrl());
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  redis?.disconnect();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

describe('Prisma repositories against a real Postgres container', () => {
  it('round-trips Venue, Seat, Event, Show and ShowSeat', async () => {
    const venues = new PrismaVenueRepository(prisma);
    const seats = new PrismaSeatRepository(prisma);
    const events = new PrismaEventCatalogRepository(prisma);
    const shows = new PrismaShowRepository(prisma);
    const showSeats = new PrismaShowSeatRepository(prisma);

    const venueId = `venue-${randomUUID()}`;
    const seatId = `seat-${randomUUID()}`;
    const eventId = `event-${randomUUID()}`;
    const showId = `show-${randomUUID()}`;

    await venues.save(new Venue({ id: venueId, name: 'PVR Saket', city: 'Delhi', address: 'Saket' }));
    await seats.saveMany([
      new Seat({ id: seatId, venueId, section: 'A', row: 'A', seatNumber: 1, tier: 'GOLD' }),
    ]);
    await events.save(
      new Event({ id: eventId, title: 'Dune 3', genre: 'SCI_FI', durationMinutes: 150 }),
    );
    await shows.save(
      new Show({
        id: showId,
        eventId,
        venueId,
        startTime: new Date(Date.now() + 72 * 3_600_000),
        endTime: new Date(Date.now() + 75 * 3_600_000),
        basePriceByTier: { GOLD: Money.of(50000) },
      }),
    );
    await showSeats.save(new ShowSeat({ showId, seatId }));

    expect((await venues.findById(venueId))?.city).toBe('Delhi');
    expect((await seats.findById(seatId))?.tier).toBe('GOLD');
    expect((await events.findById(eventId))?.genre).toBe('SCI_FI');

    const reloadedShow = await shows.findById(showId);
    expect(reloadedShow?.basePriceFor('GOLD').amount).toBe(50000);
    expect((await shows.search({ city: 'Delhi' })).some((s) => s.id === showId)).toBe(true);

    const reloadedShowSeat = await showSeats.findById(showId, seatId);
    expect(reloadedShowSeat?.status).toBe('AVAILABLE');
  });

  it('tryTransition is an atomic compare-and-swap: second attempt on the same seat fails', async () => {
    const showSeats = new PrismaShowSeatRepository(prisma);
    const showId = `show-${randomUUID()}`;
    const seatId = `seat-${randomUUID()}`;
    await ensureShowAndSeat(prisma, showId, seatId);
    await showSeats.save(new ShowSeat({ showId, seatId }));

    const first = await showSeats.tryTransition({ showId, seatId, from: 'AVAILABLE', to: 'HELD', holdId: 'h1' });
    const second = await showSeats.tryTransition({ showId, seatId, from: 'AVAILABLE', to: 'HELD', holdId: 'h2' });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await showSeats.findById(showId, seatId))?.holdId).toBe('h1');
  });

  it('round-trips Hold, Booking and Payment', async () => {
    const showId = `show-${randomUUID()}`;
    const seatId = `seat-${randomUUID()}`;
    await ensureShowAndSeat(prisma, showId, seatId);

    const holds = new PrismaHoldRepository(prisma);
    const bookings = new PrismaBookingRepository(prisma);
    const payments = new PrismaPaymentRepository(prisma);

    const hold = new Hold({
      id: `hold-${randomUUID()}`,
      showId,
      seatIds: [seatId],
      userId: 'user-1',
      createdAt: new Date(),
      ttlSeconds: 300,
    });
    await holds.save(hold);
    const reloadedHold = await holds.findById(hold.id);
    expect(reloadedHold?.expiresAt.getTime()).toBe(hold.expiresAt.getTime());

    const booking = new Booking({
      id: `booking-${randomUUID()}`,
      userId: 'user-1',
      showId,
      seatIds: [seatId],
      amount: Money.of(50000),
      createdAt: new Date(),
      holdId: hold.id,
    });
    booking.attachHold(hold.id);
    await bookings.save(booking);
    expect((await bookings.findByHoldId(hold.id))?.id).toBe(booking.id);
    expect(await bookings.countRecentByUserAndShow('user-1', showId, 10)).toBe(1);

    const idempotencyKey = `idem-${randomUUID()}`;
    const payment = new Payment({
      id: `payment-${randomUUID()}`,
      bookingId: booking.id,
      amount: Money.of(50000),
      idempotencyKey,
      provider: 'MOCK_GATEWAY',
      createdAt: new Date(),
    });
    const claim = await payments.claim(payment);
    expect(claim.created).toBe(true);

    const duplicateAttempt = new Payment({
      id: `payment-${randomUUID()}`,
      bookingId: booking.id,
      amount: Money.of(50000),
      idempotencyKey,
      provider: 'MOCK_GATEWAY',
      createdAt: new Date(),
    });
    const duplicateClaim = await payments.claim(duplicateAttempt);
    expect(duplicateClaim.created).toBe(false);
    expect(duplicateClaim.payment.id).toBe(payment.id);
  });
});

describe('RedisSeatHoldService against real Postgres + Redis: 500 callers racing one seat', () => {
  it('lets exactly one caller win', async () => {
    const showId = `flash-sale-${randomUUID()}`;
    const seatId = `seat-${randomUUID()}`;
    await ensureShowAndSeat(prisma, showId, seatId);
    const showSeats = new PrismaShowSeatRepository(prisma);
    await showSeats.save(new ShowSeat({ showId, seatId }));

    const service = new RedisSeatHoldService(showSeats, redis, 300_000);

    const results = await Promise.allSettled(
      Array.from({ length: 500 }, () => service.hold(showId, seatId, randomUUID())),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(499);
    expect(
      failed.every((r) => (r as PromiseRejectedResult).reason instanceof SeatNotAvailableError),
    ).toBe(true);

    const finalSeat = await showSeats.findById(showId, seatId);
    expect(finalSeat?.status).toBe('HELD');
  }, 60_000);
});

describe('End-to-end booking flow against the real persistence stack', () => {
  it('books a seat, confirms payment, and the hold-expiry sweep leaves confirmed bookings untouched', async () => {
    const venueId = `venue-${randomUUID()}`;
    const seatId = `seat-${randomUUID()}`;
    const eventId = `event-${randomUUID()}`;
    const showId = `show-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;

    const venues = new PrismaVenueRepository(prisma);
    const seats = new PrismaSeatRepository(prisma);
    const events = new PrismaEventCatalogRepository(prisma);
    const shows = new PrismaShowRepository(prisma);
    const showSeats = new PrismaShowSeatRepository(prisma);
    const holds = new PrismaHoldRepository(prisma);
    const bookings = new PrismaBookingRepository(prisma);
    const payments = new PrismaPaymentRepository(prisma);

    await venues.save(new Venue({ id: venueId, name: 'INOX', city: 'Mumbai', address: 'Linking Road' }));
    await seats.saveMany([
      new Seat({ id: seatId, venueId, section: 'A', row: 'A', seatNumber: 1, tier: 'GOLD' }),
    ]);
    await events.save(new Event({ id: eventId, title: 'Dune 3', genre: 'SCI_FI', durationMinutes: 150 }));
    await shows.save(
      new Show({
        id: showId,
        eventId,
        venueId,
        startTime: new Date(Date.now() + 72 * 3_600_000),
        endTime: new Date(Date.now() + 75 * 3_600_000),
        basePriceByTier: { GOLD: Money.of(50000) },
      }),
    );
    await showSeats.save(new ShowSeat({ showId, seatId }));

    const service = new BookingApplicationService(
      shows,
      seats,
      showSeats,
      holds,
      bookings,
      payments,
      new RedisSeatHoldService(showSeats, redis, 300_000),
      new FlatPricingStrategy(),
      new RefundPolicySelector(),
      new DomainEventPublisher(),
      300,
    );

    const { booking } = await service.initiateBooking({ userId, showId, seatIds: [seatId] });
    expect((await showSeats.findById(showId, seatId))?.status).toBe('HELD');

    const payment = await service.confirmPayment(booking.id, 'SUCCESS', `idem-${randomUUID()}`);
    expect(payment.status).toBe('SUCCESS');
    expect((await bookings.findById(booking.id))?.state).toBe(BookingState.CONFIRMED);
    expect((await showSeats.findById(showId, seatId))?.status).toBe('BOOKED');

    const sweep = new HoldExpirySweep(holds, service, 30_000, () => new Date());
    const swept = await sweep.runOnce();
    expect(swept).toBe(0); // nothing to expire; confirmed booking's hold is CONSUMED, not ACTIVE

    expect((await bookings.findById(booking.id))?.state).toBe(BookingState.CONFIRMED);
  }, 60_000);
});

async function ensureShowAndSeat(client: PrismaClient, showId: string, seatId: string): Promise<void> {
  const venueId = `venue-${randomUUID()}`;
  const eventId = `event-${randomUUID()}`;
  await client.venue.create({ data: { id: venueId, name: 'Test Venue', city: 'Delhi', address: 'x' } });
  await client.seat.create({
    data: { id: seatId, venueId, section: 'A', row: 'A', seatNumber: 1, tier: 'GOLD' },
  });
  await client.event.create({
    data: { id: eventId, title: 'Test Event', genre: 'DRAMA', durationMinutes: 100 },
  });
  await client.show.create({
    data: {
      id: showId,
      eventId,
      venueId,
      startTime: new Date(Date.now() + 72 * 3_600_000),
      endTime: new Date(Date.now() + 75 * 3_600_000),
      basePriceByTier: { GOLD: 50000 },
    },
  });
}
