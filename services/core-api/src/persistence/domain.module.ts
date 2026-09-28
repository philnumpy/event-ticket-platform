import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import {
  BookingApplicationService,
  BookingRepository,
  CatalogQueryService,
  DomainEventPublisher,
  EventCatalogRepository,
  FlatPricingStrategy,
  HoldRepository,
  PaymentRepository,
  RefundPolicySelector,
  SeatHoldService,
  SeatRepository,
  ShowRepository,
  ShowSeatRepository,
  VenueRepository,
} from '@etp/domain';
import { RedisSeatHoldService } from '@etp/persistence';
import {
  BOOKING_REPOSITORY,
  DOMAIN_EVENT_PUBLISHER,
  EVENT_CATALOG_REPOSITORY,
  HOLD_REPOSITORY,
  PAYMENT_REPOSITORY,
  PRICING_STRATEGY,
  REDIS_CLIENT,
  REFUND_POLICY_SELECTOR,
  SEAT_HOLD_SERVICE,
  SEAT_REPOSITORY,
  SHOW_REPOSITORY,
  SHOW_SEAT_REPOSITORY,
  VENUE_REPOSITORY,
} from './tokens';

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 300);

/**
 * Builds the two @etp/domain application services from the repository
 * ports PersistenceModule exports, plus the concrete strategy/lock/event
 * choices this deployment makes. This is the composition root for
 * "Repository + Service layering": every feature module below depends on
 * BookingApplicationService / CatalogQueryService, never on a repository
 * directly.
 */
@Module({
  providers: [
    {
      provide: PRICING_STRATEGY,
      useFactory: () => new FlatPricingStrategy(),
    },
    {
      provide: REFUND_POLICY_SELECTOR,
      useFactory: () => new RefundPolicySelector(),
    },
    {
      // Subscribers register themselves onto this instance from wherever
      // they live: CatalogCacheService (catalog module) and
      // OutboxEventPublisher (MessagingModule) both do so in their own
      // onModuleInit, rather than this factory needing to know about them.
      // Phase 1's NotificationDispatcher is the domain package's own
      // Observer-pattern demonstration and stays fully tested there; it's
      // no longer wired into the running app now that notification-service
      // is the real subscriber, reached via the outbox + Kafka instead.
      provide: DOMAIN_EVENT_PUBLISHER,
      useFactory: () => new DomainEventPublisher(),
    },
    {
      provide: SEAT_HOLD_SERVICE,
      useFactory: (showSeats: ShowSeatRepository, redis: Redis) =>
        new RedisSeatHoldService(showSeats, redis, HOLD_TTL_SECONDS * 1000),
      inject: [SHOW_SEAT_REPOSITORY, REDIS_CLIENT],
    },
    {
      provide: BookingApplicationService,
      useFactory: (
        shows: ShowRepository,
        seats: SeatRepository,
        showSeats: ShowSeatRepository,
        holds: HoldRepository,
        bookings: BookingRepository,
        payments: PaymentRepository,
        seatHoldService: SeatHoldService,
        pricingStrategy: FlatPricingStrategy,
        refundPolicySelector: RefundPolicySelector,
        eventPublisher: DomainEventPublisher,
      ) =>
        new BookingApplicationService(
          shows,
          seats,
          showSeats,
          holds,
          bookings,
          payments,
          seatHoldService,
          pricingStrategy,
          refundPolicySelector,
          eventPublisher,
          HOLD_TTL_SECONDS,
        ),
      inject: [
        SHOW_REPOSITORY,
        SEAT_REPOSITORY,
        SHOW_SEAT_REPOSITORY,
        HOLD_REPOSITORY,
        BOOKING_REPOSITORY,
        PAYMENT_REPOSITORY,
        SEAT_HOLD_SERVICE,
        PRICING_STRATEGY,
        REFUND_POLICY_SELECTOR,
        DOMAIN_EVENT_PUBLISHER,
      ],
    },
    {
      provide: CatalogQueryService,
      useFactory: (
        shows: ShowRepository,
        events: EventCatalogRepository,
        venues: VenueRepository,
        showSeats: ShowSeatRepository,
      ) => new CatalogQueryService(shows, events, venues, showSeats),
      inject: [SHOW_REPOSITORY, EVENT_CATALOG_REPOSITORY, VENUE_REPOSITORY, SHOW_SEAT_REPOSITORY],
    },
  ],
  exports: [BookingApplicationService, CatalogQueryService, DOMAIN_EVENT_PUBLISHER],
})
export class DomainModule {}
