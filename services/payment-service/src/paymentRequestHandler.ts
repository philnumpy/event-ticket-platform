import { sleep } from '@etp/domain';
import { PaymentGatewayRespondedMessage, PaymentRequestedMessage } from '@etp/messaging';
import { decideOutcome, GatewayDecision, MockGatewayConfig } from './mockGateway';

export interface ResponsePublisher {
  publishPaymentGatewayResponded(message: PaymentGatewayRespondedMessage, correlationId?: string): Promise<void>;
}

export interface PaymentRequestHandlerDeps {
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The whole "mock payment gateway" behavior in one place: decide an
 * outcome, wait a bit (simulating a real gateway round trip), respond —
 * and, per the platform's own stated requirement that the gateway can send
 * duplicate callbacks, sometimes respond twice with the *exact* same
 * idempotencyKey. That's what lets the saga's dedup logic
 * (BookingApplicationService.confirmPayment's claim()) get exercised by a
 * real producer of duplicates instead of only by a test harness pretending
 * to be one.
 */
export async function handlePaymentRequested(
  request: PaymentRequestedMessage,
  config: MockGatewayConfig,
  publisher: ResponsePublisher,
  deps: PaymentRequestHandlerDeps = {},
  correlationId?: string,
): Promise<GatewayDecision> {
  const decision = decideOutcome(config, deps.random);
  await (deps.sleep ?? sleep)(decision.delayMs);

  const response: PaymentGatewayRespondedMessage = {
    bookingId: request.bookingId,
    idempotencyKey: request.idempotencyKey,
    outcome: decision.outcome,
  };

  await publisher.publishPaymentGatewayResponded(response, correlationId);
  if (decision.duplicateCallback) {
    await publisher.publishPaymentGatewayResponded(response, correlationId);
  }

  return decision;
}
