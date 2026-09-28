import { PaymentGatewayRespondedMessage, PaymentRequestedMessage } from '@etp/messaging';
import { handlePaymentRequested, ResponsePublisher } from '../src/paymentRequestHandler';
import { MockGatewayConfig } from '../src/mockGateway';

class RecordingResponsePublisher implements ResponsePublisher {
  readonly responses: PaymentGatewayRespondedMessage[] = [];
  readonly correlationIds: Array<string | undefined> = [];

  async publishPaymentGatewayResponded(
    message: PaymentGatewayRespondedMessage,
    correlationId?: string,
  ): Promise<void> {
    this.responses.push(message);
    this.correlationIds.push(correlationId);
  }
}

const baseRequest: PaymentRequestedMessage = {
  bookingId: 'booking-1',
  userId: 'user-1',
  showId: 'show-1',
  amountMinorUnits: 50000,
  currency: 'INR',
  idempotencyKey: 'idem-1',
};

const noDuplicateConfig: MockGatewayConfig = {
  failureRate: 0,
  timeoutRate: 0,
  duplicateCallbackRate: 0,
  minDelayMs: 0,
  maxDelayMs: 1,
};

describe('handlePaymentRequested', () => {
  it('publishes exactly one SUCCESS response when nothing fails or duplicates', async () => {
    const publisher = new RecordingResponsePublisher();

    await handlePaymentRequested(baseRequest, noDuplicateConfig, publisher, {
      random: () => 0.9,
      sleep: async () => undefined,
    });

    expect(publisher.responses).toEqual([
      { bookingId: 'booking-1', idempotencyKey: 'idem-1', outcome: 'SUCCESS' },
    ]);
  });

  it('publishes the response twice, with the identical idempotencyKey, when the gateway duplicates', async () => {
    const publisher = new RecordingResponsePublisher();
    const alwaysDuplicateConfig: MockGatewayConfig = { ...noDuplicateConfig, duplicateCallbackRate: 1 };

    await handlePaymentRequested(baseRequest, alwaysDuplicateConfig, publisher, {
      random: () => 0.99, // high enough to also clear failure/timeout bands (both 0)
      sleep: async () => undefined,
    });

    expect(publisher.responses).toHaveLength(2);
    expect(publisher.responses[0]).toEqual(publisher.responses[1]);
    expect(publisher.responses[0]?.idempotencyKey).toBe('idem-1');
  });

  it('waits for the decided delay before responding', async () => {
    const publisher = new RecordingResponsePublisher();
    const delays: number[] = [];

    await handlePaymentRequested(
      baseRequest,
      { ...noDuplicateConfig, minDelayMs: 42, maxDelayMs: 43 },
      publisher,
      { random: () => 0.9, sleep: async (ms) => { delays.push(ms); } },
    );

    expect(delays).toEqual([42]);
  });

  it('propagates FAILED and TIMEOUT outcomes from the gateway decision', async () => {
    const publisher = new RecordingResponsePublisher();
    const failureConfig: MockGatewayConfig = { ...noDuplicateConfig, failureRate: 1 };

    await handlePaymentRequested(baseRequest, failureConfig, publisher, {
      random: () => 0.01,
      sleep: async () => undefined,
    });

    expect(publisher.responses[0]?.outcome).toBe('FAILED');
  });

  it('propagates the correlation ID to every published response, including duplicates', async () => {
    const publisher = new RecordingResponsePublisher();
    const alwaysDuplicateConfig: MockGatewayConfig = { ...noDuplicateConfig, duplicateCallbackRate: 1 };

    await handlePaymentRequested(
      baseRequest,
      alwaysDuplicateConfig,
      publisher,
      { random: () => 0.99, sleep: async () => undefined },
      'trace-abc',
    );

    expect(publisher.correlationIds).toEqual(['trace-abc', 'trace-abc']);
  });

  it('passes undefined correlationId through when none was supplied', async () => {
    const publisher = new RecordingResponsePublisher();

    await handlePaymentRequested(baseRequest, noDuplicateConfig, publisher, {
      random: () => 0.9,
      sleep: async () => undefined,
    });

    expect(publisher.correlationIds).toEqual([undefined]);
  });
});
