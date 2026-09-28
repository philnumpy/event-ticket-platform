import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingApplicationService, BookingRepository, DomainEventPublisher, SEATS_HELD, SeatsHeldPayload } from '@etp/domain';
import { ConsumedMessage, PaymentGatewayRespondedMessage, PaymentRequestedMessage } from '@etp/messaging';
import { BOOKING_REPOSITORY, DOMAIN_EVENT_PUBLISHER } from '../persistence/tokens';
import { PAYMENT_COMMAND_PUBLISHER, PAYMENT_RESPONSE_CONSUMER } from './tokens';
import { PaymentCommandPublisher } from './PaymentCommandPublisher';
import { ResponseConsumer } from './ResponseConsumer';
import { CircuitBreaker } from '../common/CircuitBreaker';
import { withRetryBackoff } from '../common/retryWithBackoff';
import { correlationStorage, getCorrelationId } from '../common/observability/correlation-context';
import { circuitBreakerTransitionsTotal } from '../common/metrics/metrics.registry';

/**
 * The saga orchestrator ADR 0001 named but hadn't been built yet: reacts to
 * a booking's seats being held by asking payment-service (a separate
 * process, reached only via Kafka) to charge the customer, then reacts to
 * that response by calling the exact same BookingApplicationService
 * .confirmPayment() a synchronous HTTP caller would have called directly in
 * Phase 2 — the saga decides *when* and *with what outcome* that call
 * happens, it doesn't reimplement what it does.
 *
 * Deliberately thin: there is no explicit "compensate" step here for
 * payment-service never responding at all (killed, network partition,
 * whatever). That's not an oversight — HoldExpirySweep (Phase 2) already
 * compensates for exactly that case, because a booking that never gets a
 * payment response simply stays HELD until its hold's TTL elapses, at
 * which point the sweep releases the seat and expires the booking. The
 * hold TTL isn't just a UX nicety; it's this saga's timeout-based
 * compensating action for the "payment service is down" failure mode. See
 * the chaos test and ADR 0004.
 */
@Injectable()
export class BookingSagaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingSagaService.name);
  private readonly paymentCommandBreaker = new CircuitBreaker(
    'payment-command-publisher',
    { failureThreshold: 5, cooldownMs: 30_000, timeoutMs: 5_000 },
    undefined,
    (state) => circuitBreakerTransitionsTotal.inc({ breaker: 'payment-command-publisher', state }),
  );

  constructor(
    private readonly bookingService: BookingApplicationService,
    @Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly domainEvents: DomainEventPublisher,
    @Inject(PAYMENT_COMMAND_PUBLISHER) private readonly paymentCommands: PaymentCommandPublisher,
    @Inject(PAYMENT_RESPONSE_CONSUMER) private readonly paymentResponses: ResponseConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    this.domainEvents.subscribe<SeatsHeldPayload>(SEATS_HELD, (event) =>
      this.requestPayment(event.payload),
    );
    await this.paymentCommands.connect();
    // consumer.start() polls in the background for the process's lifetime;
    // Nest's lifecycle hook doesn't need to (and shouldn't) await it.
    void this.paymentResponses.start((message) => this.handleGatewayResponse(message));
  }

  async onModuleDestroy(): Promise<void> {
    await this.paymentCommands.disconnect();
    await this.paymentResponses.stop();
  }

  private async requestPayment(payload: SeatsHeldPayload): Promise<void> {
    const booking = await this.bookings.findById(payload.bookingId);
    if (!booking) {
      this.logger.warn(`SEATS_HELD for unknown booking ${payload.bookingId}; skipping payment request`);
      return;
    }

    const message: PaymentRequestedMessage = {
      bookingId: booking.id,
      userId: booking.userId,
      showId: booking.showId,
      amountMinorUnits: booking.amount.amount,
      currency: booking.amount.currencyCode,
      idempotencyKey: randomUUID(),
    };

    const correlationId = getCorrelationId();
    try {
      await this.paymentCommandBreaker.execute(() =>
        withRetryBackoff(() => this.paymentCommands.publishPaymentRequested(message, correlationId), {
          maxAttempts: 3,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
        }),
      );
    } catch (err) {
      // Deliberately not rethrown. This handler runs synchronously inside
      // initiateBooking's SEATS_HELD publish — the booking is already
      // durably HELD, so letting this propagate would fail a booking
      // request that actually succeeded, over a downstream dependency
      // (Kafka/payment-service) the client had no way to know about.
      // Graceful degradation here means exactly what it means for an
      // answered-but-never-responded-to payment request: HoldExpirySweep
      // compensates once the hold's TTL elapses. See ADR 0004.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to publish payment.requested for booking ${booking.id} ` +
          `(circuit: ${this.paymentCommandBreaker.getState()}): ${reason}`,
      );
    }
  }

  private async handleGatewayResponse(message: ConsumedMessage): Promise<void> {
    if (!message.value) return;
    // Re-enter the originating request's correlation context (carried as a
    // Kafka header by PaymentCommandPublisher/KafkaResponsePublisher) so
    // every log line from this point on -- including inside
    // confirmPayment -- is attributable to the same trace, even though
    // we're now running in a Kafka consumer callback, not an HTTP request.
    const correlationId = message.headers.correlationId ?? randomUUID();
    await correlationStorage.run({ correlationId }, () => this.processGatewayResponse(message.value!));
  }

  private async processGatewayResponse(rawValue: string): Promise<void> {
    const payload = JSON.parse(rawValue) as PaymentGatewayRespondedMessage;

    try {
      await this.bookingService.confirmPayment(payload.bookingId, payload.outcome, payload.idempotencyKey);
    } catch (err) {
      // A HoldExpiredError here means the sweep already compensated before
      // this (possibly late/duplicate) gateway response arrived -- expected
      // under real network conditions, not a processing failure. Anything
      // else propagates so the consumer's retry/DLQ logic applies.
      if (err instanceof Error && err.name === 'HoldExpiredError') {
        this.logger.log(`Payment response for ${payload.bookingId} arrived after its hold expired`);
        return;
      }
      throw err;
    }
  }
}
