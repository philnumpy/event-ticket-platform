import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  InMemoryBookingRepository,
  InMemoryEventCatalogRepository,
  InMemoryHoldRepository,
  InMemoryPaymentRepository,
  InMemorySeatRepository,
  InMemoryShowRepository,
  InMemoryShowSeatRepository,
  InMemoryVenueRepository,
} from '@etp/domain';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/domain-exception.filter';
import {
  BOOKING_REPOSITORY,
  EVENT_CATALOG_REPOSITORY,
  HOLD_REPOSITORY,
  PAYMENT_REPOSITORY,
  PRISMA_CLIENT,
  REDIS_CLIENT,
  SEAT_REPOSITORY,
  SHOW_REPOSITORY,
  SHOW_SEAT_REPOSITORY,
  VENUE_REPOSITORY,
} from '../src/persistence/tokens';
import { FakeRedis } from './fakes/FakeRedis';

export interface TestApp {
  app: INestApplication;
  venues: InMemoryVenueRepository;
  seats: InMemorySeatRepository;
  events: InMemoryEventCatalogRepository;
  shows: InMemoryShowRepository;
  showSeats: InMemoryShowSeatRepository;
  holds: InMemoryHoldRepository;
  bookings: InMemoryBookingRepository;
  payments: InMemoryPaymentRepository;
  redis: FakeRedis;
}

/**
 * Builds the real AppModule with every infrastructure token swapped for a
 * Phase-1 in-memory adapter or FakeRedis — the same "same ports, different
 * adapter" trick that makes @etp/domain's own tests infra-free. Nothing
 * here is Docker-dependent, which is exactly the point: HTTP wiring, DTO
 * validation, the exception filter, and cache behavior are all verified
 * without a real Postgres or Redis.
 */
export async function buildTestApp(): Promise<TestApp> {
  const venues = new InMemoryVenueRepository();
  const seats = new InMemorySeatRepository();
  const events = new InMemoryEventCatalogRepository();
  const shows = new InMemoryShowRepository(venues, events);
  const showSeats = new InMemoryShowSeatRepository();
  const holds = new InMemoryHoldRepository();
  const bookings = new InMemoryBookingRepository();
  const payments = new InMemoryPaymentRepository();
  const redis = new FakeRedis();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRISMA_CLIENT)
    .useValue({ $disconnect: async () => undefined })
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
    .overrideProvider(VENUE_REPOSITORY)
    .useValue(venues)
    .overrideProvider(SEAT_REPOSITORY)
    .useValue(seats)
    .overrideProvider(EVENT_CATALOG_REPOSITORY)
    .useValue(events)
    .overrideProvider(SHOW_REPOSITORY)
    .useValue(shows)
    .overrideProvider(SHOW_SEAT_REPOSITORY)
    .useValue(showSeats)
    .overrideProvider(HOLD_REPOSITORY)
    .useValue(holds)
    .overrideProvider(BOOKING_REPOSITORY)
    .useValue(bookings)
    .overrideProvider(PAYMENT_REPOSITORY)
    .useValue(payments)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();

  return { app, venues, seats, events, shows, showSeats, holds, bookings, payments, redis };
}
