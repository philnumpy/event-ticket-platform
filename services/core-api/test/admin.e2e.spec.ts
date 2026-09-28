import request from 'supertest';
import { buildTestApp, TestApp } from './testApp';

describe('Admin HTTP', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('provisions a venue, seats, an event, a show, and its inventory end to end', async () => {
    const http = testApp.app.getHttpServer();

    const venue = await request(http)
      .post('/admin/venues')
      .send({ name: 'PVR Saket', city: 'Delhi', address: 'Saket' });
    expect(venue.status).toBe(201);
    const venueId = venue.body.id as string;

    const seats = await request(http)
      .post(`/admin/venues/${venueId}/seats`)
      .send({
        seats: [
          { section: 'A', row: 'A', seatNumber: 1, tier: 'GOLD' },
          { section: 'A', row: 'A', seatNumber: 2, tier: 'GOLD' },
        ],
      });
    expect(seats.status).toBe(201);
    expect(seats.body).toHaveLength(2);

    const event = await request(http)
      .post('/admin/events')
      .send({ title: 'Dune 3', genre: 'SCI_FI', durationMinutes: 150 });
    expect(event.status).toBe(201);
    const eventId = event.body.id as string;

    const show = await request(http)
      .post('/admin/shows')
      .send({
        eventId,
        venueId,
        startTime: new Date(Date.now() + 72 * 3_600_000).toISOString(),
        endTime: new Date(Date.now() + 75 * 3_600_000).toISOString(),
        basePriceByTier: { GOLD: 50000 },
      });
    expect(show.status).toBe(201);
    const showId = show.body.id as string;

    const inventory = await request(http).post(`/admin/shows/${showId}/inventory`).send({ venueId });
    expect(inventory.status).toBe(201);
    expect(inventory.body.seatsProvisioned).toBe(2);

    const seatMap = await request(http).get(`/shows/${showId}/seat-map`);
    expect(seatMap.body).toHaveLength(2);
  });

  it('rejects an invalid seat tier with 400', async () => {
    const venue = await request(testApp.app.getHttpServer())
      .post('/admin/venues')
      .send({ name: 'INOX', city: 'Mumbai', address: 'Linking Road' });

    const res = await request(testApp.app.getHttpServer())
      .post(`/admin/venues/${venue.body.id}/seats`)
      .send({ seats: [{ section: 'A', row: 'A', seatNumber: 1, tier: 'DIAMOND' }] });

    expect(res.status).toBe(400);
  });
});
