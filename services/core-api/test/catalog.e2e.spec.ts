import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';
import { seedShow } from './fixtures';

describe('Catalog HTTP', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('GET /shows filters by city', async () => {
    await seedShow(testApp, { showId: 'show-cat-1', seatIds: ['seat-1'] });

    const hit = await request(testApp.app.getHttpServer()).get('/shows').query({ city: 'Delhi' });
    expect(hit.status).toBe(200);
    expect(hit.body.some((s: { showId: string }) => s.showId === 'show-cat-1')).toBe(true);

    const miss = await request(testApp.app.getHttpServer()).get('/shows').query({ city: 'Mumbai' });
    expect(miss.body.some((s: { showId: string }) => s.showId === 'show-cat-1')).toBe(false);
  });

  it('rejects a malformed dateFrom with 400', async () => {
    const res = await request(testApp.app.getHttpServer()).get('/shows').query({ dateFrom: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('GET /shows/:id/seat-map returns per-seat availability', async () => {
    await seedShow(testApp, { showId: 'show-cat-2', seatIds: ['seat-a', 'seat-b'] });

    const res = await request(testApp.app.getHttpServer()).get('/shows/show-cat-2/seat-map');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((s: { status: string }) => s.status === 'AVAILABLE')).toBe(true);
  });
});
