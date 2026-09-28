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
import { InMemoryOutboxRepository, KafkaEventPublisher, OutboxRepository } from '@etp/messaging';
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
import { PAYMENT_COMMAND_PUBLISHER, PAYMENT_RESPONSE_CONSUMER } from '../src/saga/tokens';
import { OUTBOX_REPOSITORY } from '../src/messaging/tokens';
import { RATE_LIMITER } from '../src/common/rate-limit/tokens';
import { RateLimiter } from '../src/common/rate-limit/RateLimiter';
import { InMemoryTokenBucketRateLimiter } from '../src/common/rate-limit/InMemoryTokenBucketRateLimiter';
import { FakeRedis } from './fakes/FakeRedis';
import { NoopEventPublisher, NoopPaymentCommandPublisher, NoopResponseConsumer } from './fakes/NoopKafkaFakes';

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
  outbox: NoopEventPublisher;
  outboxRepository: OutboxRepository;
  paymentCommands: NoopPaymentCommandPublisher;
  paymentResponses: NoopResponseConsumer;
}

export interface BuildTestAppOptions {
  /** Defaults to an effectively-unlimited in-memory bucket so ordinary
   * e2e tests firing a handful of requests never trip it. A test that
   * specifically wants to exercise 429 behavior supplies its own
   * low-capacity limiter instead. */
  rateLimiter?: RateLimiter;
}

/**
 * Builds the real AppModule with every infrastructure token swapped for a
 * Phase-1 in-memory adapter, FakeRedis, or a no-op Kafka stand-in — the
 * same "same ports, different adapter" trick that makes @etp/domain's own
 * tests infra-free. Nothing here is Docker-dependent: HTTP wiring, DTO
 * validation, the exception filter, cache behavior, and now the saga's
 * publish-a-command / react-to-a-response logic are all verified without a
 * real Postgres, Redis, or Kafka broker.
 */
export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<TestApp> {
  const venues = new InMemoryVenueRepository();
  const seats = new InMemorySeatRepository();
  const events = new InMemoryEventCatalogRepository();
  const shows = new InMemoryShowRepository(venues, events);
  const showSeats = new InMemoryShowSeatRepository();
  const holds = new InMemoryHoldRepository();
  const bookings = new InMemoryBookingRepository();
  const payments = new InMemoryPaymentRepository();
  const redis = new FakeRedis();
  const outbox = new NoopEventPublisher();
  const outboxRepository = new InMemoryOutboxRepository();
  const paymentCommands = new NoopPaymentCommandPublisher();
  const paymentResponses = new NoopResponseConsumer();
  const rateLimiter =
    options.rateLimiter ??
    new InMemoryTokenBucketRateLimiter({ capacity: 10_000, refillTokensPerSecond: 10_000 });

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
    .overrideProvider(OUTBOX_REPOSITORY)
    .useValue(outboxRepository)
    .overrideProvider(KafkaEventPublisher)
    .useValue(outbox)
    .overrideProvider(PAYMENT_COMMAND_PUBLISHER)
    .useValue(paymentCommands)
    .overrideProvider(PAYMENT_RESPONSE_CONSUMER)
    .useValue(paymentResponses)
    .overrideProvider(RATE_LIMITER)
    .useValue(rateLimiter)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  // Tests fire many concurrent supertest requests at one server instance
  // (e.g. the idempotency-claim race test) -- harmless in practice, but
  // raise the limit so it doesn't print a spurious leak warning.
  app.getHttpServer().setMaxListeners(50);

  return {
    app,
    venues,
    seats,
    events,
    shows,
    showSeats,
    holds,
    bookings,
    payments,
    redis,
    outbox,
    outboxRepository,
    paymentCommands,
    paymentResponses,
  };
}
