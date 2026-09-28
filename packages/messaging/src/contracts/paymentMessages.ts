import { PaymentOutcome } from '@etp/domain';

/**
 * The wire contract between core-api's booking saga and payment-service.
 * Lives here (not in either service) because both need the exact same
 * shape and neither should depend on the other directly — they only ever
 * talk through Kafka.
 */
export const PAYMENT_REQUESTED_TOPIC = 'etp.payment.requested';
export const PAYMENT_GATEWAY_RESPONDED_TOPIC = 'etp.payment.gateway.responded';

export interface PaymentRequestedMessage {
  bookingId: string;
  userId: string;
  showId: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentGatewayRespondedMessage {
  bookingId: string;
  idempotencyKey: string;
  outcome: PaymentOutcome;
}
