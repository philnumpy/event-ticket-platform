import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';
import { seedShow } from './fixtures';
import { PaymentGatewayRespondedMessage } from '../src/saga/booking-saga.messages';

describe('BookingSagaService', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('publishes a payment.requested command in reaction to SEATS_HELD', async () => {
    await seedShow(testApp, { showId: 'show-saga-1', seatIds: ['seat-1'] });

    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-saga-1', seatIds: ['seat-1'] });
    const bookingId = initiate.body.booking.id as string;

    // SEATS_HELD is published synchronously inside initiateBooking, and the
    // saga's subscriber handler runs asynchronously off that same publish
    // call; give the microtask/promise chain a tick to settle.
    await new Promise((resolve) => setImmediate(resolve));

    const requested = testApp.paymentCommands.requested.find((m) => m.bookingId === bookingId);
    expect(requested).toBeDefined();
    expect(requested?.amountMinorUnits).toBe(50000);
    expect(requested?.idempotencyKey).toBeTruthy();
  });

  it('confirms the booking when the simulated payment gateway responds SUCCESS', async () => {
    await seedShow(testApp, { showId: 'show-saga-2', seatIds: ['seat-1'] });

    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-saga-2', seatIds: ['seat-1'] });
    const bookingId = initiate.body.booking.id as string;
    await new Promise((resolve) => setImmediate(resolve));

    const requested = testApp.paymentCommands.requested.find((m) => m.bookingId === bookingId);
    const response: PaymentGatewayRespondedMessage = {
      bookingId,
      idempotencyKey: requested!.idempotencyKey,
      outcome: 'SUCCESS',
    };
    await testApp.paymentResponses.simulateMessage(JSON.stringify(response));

    const booking = await testApp.bookings.findById(bookingId);
    expect(booking?.state).toBe('CONFIRMED');

    const seat = await testApp.showSeats.findById('show-saga-2', 'seat-1');
    expect(seat?.status).toBe('BOOKED');
  });

  it('cancels the booking when the simulated payment gateway responds FAILED, freeing the seat', async () => {
    await seedShow(testApp, { showId: 'show-saga-3', seatIds: ['seat-1'] });

    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-saga-3', seatIds: ['seat-1'] });
    const bookingId = initiate.body.booking.id as string;
    await new Promise((resolve) => setImmediate(resolve));

    const requested = testApp.paymentCommands.requested.find((m) => m.bookingId === bookingId);
    await testApp.paymentResponses.simulateMessage(
      JSON.stringify({ bookingId, idempotencyKey: requested!.idempotencyKey, outcome: 'FAILED' }),
    );

    const booking = await testApp.bookings.findById(bookingId);
    expect(booking?.state).toBe('CANCELLED');

    const seat = await testApp.showSeats.findById('show-saga-3', 'seat-1');
    expect(seat?.status).toBe('AVAILABLE');
  });

  it('deduplicates a simulated duplicate gateway callback via the idempotency claim', async () => {
    await seedShow(testApp, { showId: 'show-saga-4', seatIds: ['seat-1'] });

    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-saga-4', seatIds: ['seat-1'] });
    const bookingId = initiate.body.booking.id as string;
    await new Promise((resolve) => setImmediate(resolve));

    const requested = testApp.paymentCommands.requested.find((m) => m.bookingId === bookingId);
    const response = JSON.stringify({
      bookingId,
      idempotencyKey: requested!.idempotencyKey,
      outcome: 'SUCCESS',
    });

    // The mocked gateway is explicitly allowed to send duplicate callbacks;
    // the saga just feeds both into confirmPayment and Phase 2's claim()
    // does the deduping.
    await Promise.all([
      testApp.paymentResponses.simulateMessage(response),
      testApp.paymentResponses.simulateMessage(response),
    ]);

    const booking = await testApp.bookings.findById(bookingId);
    expect(booking?.state).toBe('CONFIRMED'); // not corrupted by processing it twice
  });
});
