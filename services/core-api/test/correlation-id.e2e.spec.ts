import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';
import { CORRELATION_ID_HEADER } from '../src/common/observability/correlation-id.middleware';
import { seedShow } from './fixtures';

describe('Correlation ID propagation', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('echoes a caller-supplied correlation ID back in the response header', async () => {
    const res = await request(testApp.app.getHttpServer())
      .get('/shows')
      .set(CORRELATION_ID_HEADER, 'caller-supplied-trace-id');

    expect(res.headers[CORRELATION_ID_HEADER]).toBe('caller-supplied-trace-id');
  });

  it('mints a fresh correlation ID when the caller does not supply one', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/shows');

    expect(res.headers[CORRELATION_ID_HEADER]).toBeTruthy();
    expect(typeof res.headers[CORRELATION_ID_HEADER]).toBe('string');
  });

  it('gives two separate requests two different correlation IDs', async () => {
    const first = await request(testApp.app.getHttpServer()).get('/shows');
    const second = await request(testApp.app.getHttpServer()).get('/shows');

    expect(first.headers[CORRELATION_ID_HEADER]).not.toBe(second.headers[CORRELATION_ID_HEADER]);
  });

  it('carries the request correlation ID through to the outbox record for a domain event it caused', async () => {
    await seedShow(testApp, { showId: 'show-corr-1', seatIds: ['seat-1'] });

    const res = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .set(CORRELATION_ID_HEADER, 'booking-trace-1')
      .send({ userId: 'user-1', showId: 'show-corr-1', seatIds: ['seat-1'] });

    expect(res.status).toBe(201);

    const outboxRecords = await testApp.outboxRepository.findUnpublished(100);
    const seatsHeldRecord = outboxRecords.find(
      (r) => r.type === 'seats.held' && (r.payload as { bookingId?: string }).bookingId === res.body.booking.id,
    );

    expect(seatsHeldRecord?.correlationId).toBe('booking-trace-1');
  });

  it('carries the request correlation ID through to the saga\'s payment.requested command', async () => {
    await seedShow(testApp, { showId: 'show-corr-2', seatIds: ['seat-1'] });

    const res = await request(testApp.app.getHttpServer())
      .post('/bookings')
      .set(CORRELATION_ID_HEADER, 'booking-trace-2')
      .send({ userId: 'user-1', showId: 'show-corr-2', seatIds: ['seat-1'] });

    const index = testApp.paymentCommands.requested.findIndex((m) => m.bookingId === res.body.booking.id);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(testApp.paymentCommands.correlationIds[index]).toBe('booking-trace-2');
  });
});
