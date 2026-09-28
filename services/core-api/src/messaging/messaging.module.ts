import { Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { DomainEventPublisher } from '@etp/domain';
import {
  createKafkaClient,
  EventPublisherPort,
  KafkaEventPublisher,
  OutboxEventPublisher,
  OutboxRelay,
  OutboxRepository,
  PrismaOutboxRepository,
} from '@etp/messaging';
import { DomainModule } from '../persistence/domain.module';
import { DOMAIN_EVENT_PUBLISHER, PRISMA_CLIENT } from '../persistence/tokens';
import { OUTBOX_RELAY, OUTBOX_REPOSITORY } from './tokens';

const OUTBOX_POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1_000);

/**
 * Replaces Phase 1's direct NotificationDispatcher.register(publisher) call
 * with the outbox pipeline: OutboxEventPublisher (an Observer, same shape
 * as NotificationDispatcher) durably records every event, and OutboxRelay
 * polls and forwards them to Kafka, where notification-service is the real
 * consumer. NotificationDispatcher itself is untouched in @etp/domain and
 * still fully tested there — this module just stops wiring it into the
 * running app now that a real subscriber exists downstream.
 */
@Module({
  imports: [DomainModule],
  providers: [
    {
      provide: OUTBOX_REPOSITORY,
      useFactory: (prisma: PrismaClient): OutboxRepository => new PrismaOutboxRepository(prisma),
      inject: [PRISMA_CLIENT],
    },
    {
      provide: KafkaEventPublisher,
      useFactory: (): EventPublisherPort =>
        new KafkaEventPublisher(createKafkaClient('core-api')),
    },
    {
      provide: OUTBOX_RELAY,
      useFactory: (outbox: OutboxRepository, publisher: EventPublisherPort) =>
        new OutboxRelay(outbox, publisher, { pollIntervalMs: OUTBOX_POLL_INTERVAL_MS }),
      inject: [OUTBOX_REPOSITORY, KafkaEventPublisher],
    },
  ],
  exports: [OUTBOX_REPOSITORY, OUTBOX_RELAY],
})
export class MessagingModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly domainEvents: DomainEventPublisher,
    @Inject(OUTBOX_RELAY) private readonly relay: OutboxRelay,
  ) {}

  onModuleInit(): void {
    new OutboxEventPublisher(this.outbox).register(this.domainEvents);
    this.relay.start();
  }

  onModuleDestroy(): void {
    this.relay.stop();
  }
}
