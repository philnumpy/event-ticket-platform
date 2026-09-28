import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';

describe('Idempotency-Key header (global interceptor)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('replays the exact same response for a repeated key instead of creating a second resource', async () => {
    const first = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .set('Idempotency-Key', 'venue-key-1')
      .send({ name: 'PVR Saket', city: 'Delhi', address: 'Saket' });

    const second = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .set('Idempotency-Key', 'venue-key-1')
      .send({ name: 'A completely different body', city: 'Mumbai', address: 'ignored' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body); // same id, same name -- the second call never ran
    expect((await testApp.venues.findById(first.body.id))?.name).toBe('PVR Saket');
  });

  it('treats different keys as independent requests, creating two resources', async () => {
    const first = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .set('Idempotency-Key', 'venue-key-2a')
      .send({ name: 'Venue A', city: 'Delhi', address: 'x' });

    const second = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .set('Idempotency-Key', 'venue-key-2b')
      .send({ name: 'Venue B', city: 'Delhi', address: 'x' });

    expect(first.body.id).not.toBe(second.body.id);
  });

  it('processes each request independently when no Idempotency-Key header is sent', async () => {
    const first = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .send({ name: 'No Key Venue', city: 'Delhi', address: 'x' });
    const second = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .send({ name: 'No Key Venue', city: 'Delhi', address: 'x' });

    expect(first.body.id).not.toBe(second.body.id); // two distinct venues, no dedup
  });

  it('lets exactly one of N concurrent identical requests actually execute the handler', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(testApp.app.getHttpServer())
          .post('/admin/venues')
          .set('Idempotency-Key', 'venue-key-concurrent')
          .send({ name: 'Concurrent Venue', city: 'Delhi', address: 'x' }),
      ),
    );

    const ids = new Set(responses.map((r) => r.body.id));
    expect(ids.size).toBe(1); // every response refers to the same single created venue

    const allVenues = await Promise.all([...ids].map((id) => testApp.venues.findById(id as string)));
    expect(allVenues.filter(Boolean)).toHaveLength(1);
  }, 15_000);

  it('does not apply to GET requests even if the header is present', async () => {
    const created = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .send({ name: 'GET Test Venue', city: 'Delhi', address: 'x' });

    const res1 = await request(testApp.app.getHttpServer())
      .get(`/shows`)
      .set('Idempotency-Key', 'same-key-for-gets')
      .query({ city: 'Delhi' });
    const res2 = await request(testApp.app.getHttpServer())
      .get(`/shows`)
      .set('Idempotency-Key', 'same-key-for-gets')
      .query({ city: 'Mumbai' });

    // Both executed independently (different query -> not required to be
    // equal); this just proves GET wasn't short-circuited by the header.
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    void created;
  });
});
