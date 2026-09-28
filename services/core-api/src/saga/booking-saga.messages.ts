import { PaymentOutcome } from '@etp/domain';

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
