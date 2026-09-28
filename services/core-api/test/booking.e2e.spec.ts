import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';
import { seedShow } from './fixtures';

describe('Booking HTTP', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('initiates a booking, confirms payment, and the seat map reflects BOOKED', async () => {
    await seedShow(testApp, { showId: 'show-b1', seatIds: ['seat-1'] });

    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-b1', seatIds: ['seat-1'] });
    expect(initiate.status).toBe(201);
    expect(initiate.body.booking.state).toBe('HELD');
    const bookingId = initiate.body.booking.id as string;

    const seatMapAfterHold = await request(testApp.app.getHttpServer()).get('/shows/show-b1/seat-map');
    expect(seatMapAfterHold.body[0].status).toBe('HELD');

    const pay = await request(testApp.app.getHttpServer())
      .post(`/bookings/${bookingId}/payment`)
      .send({ outcome: 'SUCCESS', idempotencyKey: 'idem-show-b1' });
    expect(pay.status).toBe(200);
    expect(pay.body.status).toBe('SUCCESS');

    const seatMapAfterPay = await request(testApp.app.getHttpServer()).get('/shows/show-b1/seat-map');
    expect(seatMapAfterPay.body[0].status).toBe('BOOKED');
  });

  it('maps NotFoundError to a 404 through the global exception filter', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'nonexistent-show', seatIds: ['seat-x'] });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });

  it('rejects a malformed request body with 400 before it reaches the domain layer', async () => {
    const res = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1' }); // missing showId and seatIds

    expect(res.status).toBe(400);
  });

  it('maps SeatNotAvailableError to 409 when two bookings race the same seat', async () => {
    await seedShow(testApp, { showId: 'show-b2', seatIds: ['seat-1'] });
    await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-b2', seatIds: ['seat-1'] });

    const res = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-2', showId: 'show-b2', seatIds: ['seat-1'] });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SeatNotAvailableError');
  });

  it('cancels a HELD booking with zero refund and frees the seat', async () => {
    await seedShow(testApp, { showId: 'show-b3', seatIds: ['seat-1'] });
    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-b3', seatIds: ['seat-1'] });
    const bookingId = initiate.body.booking.id as string;

    const cancel = await request(testApp.app.getHttpServer()).post(`/bookings/${bookingId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.refundAmountMinorUnits).toBe(0);

    const seatMap = await request(testApp.app.getHttpServer()).get('/shows/show-b3/seat-map');
    expect(seatMap.body[0].status).toBe('AVAILABLE');
  });

  it('treats a duplicate payment idempotency key as a no-op replay over HTTP', async () => {
    await seedShow(testApp, { showId: 'show-b4', seatIds: ['seat-1'] });
    const initiate = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .send({ userId: 'user-1', showId: 'show-b4', seatIds: ['seat-1'] });
    const bookingId = initiate.body.booking.id as string;

    const first = await request(testApp.app.getHttpServer())
      .post(`/bookings/${bookingId}/payment`)
      .send({ outcome: 'SUCCESS', idempotencyKey: 'shared-key' });
    const second = await request(testApp.app.getHttpServer())
      .post(`/bookings/${bookingId}/payment`)
      .send({ outcome: 'SUCCESS', idempotencyKey: 'shared-key' });

    expect(first.body.id).toBe(second.body.id);
  });
});
