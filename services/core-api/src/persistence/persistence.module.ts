import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import {
  createPrismaClient,
  createRedisClient,
  PrismaBookingRepository,
  PrismaEventCatalogRepository,
  PrismaHoldRepository,
  PrismaPaymentRepository,
  PrismaSeatRepository,
  PrismaShowRepository,
  PrismaShowSeatRepository,
  PrismaVenueRepository,
} from '@etp/persistence';
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
} from './tokens';

/**
 * The only module in this app that imports from @etp/persistence directly.
 * Everything downstream (DomainModule, every feature module) depends on the
 * @etp/domain port tokens below, never on Prisma or ioredis types — the
 * same boundary @etp/persistence's own tests exercise with Testcontainers.
 */
@Global()
@Module({
  providers: [
    { provide: PRISMA_CLIENT, useFactory: () => createPrismaClient(process.env.DATABASE_URL) },
    { provide: REDIS_CLIENT, useFactory: () => createRedisClient(process.env.REDIS_URL) },
    {
      provide: VENUE_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaVenueRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: SEAT_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaSeatRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: EVENT_CATALOG_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaEventCatalogRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: SHOW_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaShowRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: SHOW_SEAT_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaShowSeatRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: HOLD_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaHoldRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: BOOKING_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaBookingRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: PAYMENT_REPOSITORY,
      useFactory: (prisma: PrismaClient) => new PrismaPaymentRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
  ],
  exports: [
    PRISMA_CLIENT,
    REDIS_CLIENT,
    VENUE_REPOSITORY,
    SEAT_REPOSITORY,
    EVENT_CATALOG_REPOSITORY,
    SHOW_REPOSITORY,
    SHOW_SEAT_REPOSITORY,
    HOLD_REPOSITORY,
    BOOKING_REPOSITORY,
    PAYMENT_REPOSITORY,
  ],
})
export class PersistenceModule implements OnModuleDestroy {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    this.redis.disconnect();
  }
}
