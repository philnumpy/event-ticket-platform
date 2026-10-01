import http from 'k6/http';
import { check } from 'k6';

/**
 * Provisions one show with `seatCount` seats, via the same admin HTTP API
 * a real operator would use — not a direct DB seed — so this exercises the
 * real request path end to end, including CACHE_ENABLED's effect on the
 * seat-map read the flash-sale scenario immediately hits afterward.
 */
export function provisionShow(baseUrl, seatCount) {
  const venueRes = http.post(
    `${baseUrl}/admin/venues`,
    JSON.stringify({ name: 'Load Test Arena', city: 'Delhi', address: 'NH-8' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(venueRes, { 'venue created': (r) => r.status === 201 });
  const venueId = venueRes.json('id');

  const seats = [];
  for (let i = 0; i < seatCount; i++) {
    seats.push({
      section: 'A',
      row: String.fromCharCode(65 + Math.floor(i / 50)), // A, B, C, ... 50 seats per row
      seatNumber: (i % 50) + 1,
      tier: 'GOLD',
    });
  }
  const seatsRes = http.post(`${baseUrl}/admin/venues/${venueId}/seats`, JSON.stringify({ seats }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(seatsRes, { 'seats created': (r) => r.status === 201 });
  const seatIds = seatsRes.json().map((s) => s.id);

  const eventRes = http.post(
    `${baseUrl}/admin/events`,
    JSON.stringify({ title: 'Load Test Movie', genre: 'ACTION', durationMinutes: 120 }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(eventRes, { 'event created': (r) => r.status === 201 });
  const eventId = eventRes.json('id');

  const now = Date.now();
  const showRes = http.post(
    `${baseUrl}/admin/shows`,
    JSON.stringify({
      eventId,
      venueId,
      startTime: new Date(now + 72 * 3_600_000).toISOString(),
      endTime: new Date(now + 75 * 3_600_000).toISOString(),
      basePriceByTier: { GOLD: 50000 },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(showRes, { 'show created': (r) => r.status === 201 });
  const showId = showRes.json('id');

  const inventoryRes = http.post(
    `${baseUrl}/admin/shows/${showId}/inventory`,
    JSON.stringify({ venueId }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(inventoryRes, { 'inventory provisioned': (r) => r.status === 201 });

  return { showId, seatIds };
}
