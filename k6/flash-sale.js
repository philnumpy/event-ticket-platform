import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { provisionShow } from './lib/provision.js';

/**
 * Flash-sale scenario: a fixed, small pool of seats (SEAT_COUNT) contended
 * by a much larger number of concurrent virtual users (ramping up to
 * MAX_VUS) — modeling "10K concurrent users on one popular show" from the
 * NFRs. Most booking attempts are *expected* to fail with 409 (someone
 * else got the seat first); that's the correct outcome of a flash sale,
 * not a bug. What this proves:
 *
 *   1. Zero double-booking under real concurrent HTTP load (not just the
 *      in-process tests) -- see the post-run seat-map integrity check in
 *      k6/README.md.
 *   2. p99 read latency < 200ms for seat-map/browse (the stated NFR),
 *      measured on the READ path specifically, independent of how
 *      contended the write path is.
 *
 * Run with CACHE_ENABLED=false (core-api restarted) for the "without
 * cache" baseline, then CACHE_ENABLED=true for comparison -- see
 * k6/README.md for the full before/after procedure.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SEAT_COUNT = Number(__ENV.SEAT_COUNT || 500);
const MAX_VUS = Number(__ENV.MAX_VUS || 500); // raise once running against real infra; see README

const browseDuration = new Trend('browse_duration', true);
const seatMapDuration = new Trend('seatmap_duration', true);
const bookingSuccess = new Counter('booking_success');
const bookingConflict = new Counter('booking_conflict_409');
const bookingOtherError = new Counter('booking_other_error');
const paymentSuccess = new Counter('payment_success');

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.floor(MAX_VUS * 0.5) },
        { duration: '1m', target: MAX_VUS }, // peak: everyone refreshing for the same on-sale show
        { duration: '30s', target: Math.floor(MAX_VUS * 0.2) },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    // The stated NFR, scoped to the read paths specifically -- booking
    // writes are allowed to be slower/fail under contention, that's not
    // what this threshold is protecting.
    'browse_duration': ['p(95)<200', 'p(99)<200'],
    'seatmap_duration': ['p(95)<200', 'p(99)<200'],
    'http_req_failed': ['rate<0.01'], // network-level failures only; 4xx/5xx aren't counted here by default
  },
};

export function setup() {
  return provisionShow(BASE_URL, SEAT_COUNT);
}

export default function (data) {
  const { showId, seatIds } = data;
  const headers = { 'Content-Type': 'application/json' };

  const browseRes = http.get(`${BASE_URL}/shows?city=Delhi`, {
    tags: { name: 'browse' },
  });
  browseDuration.add(browseRes.timings.duration);
  check(browseRes, { 'browse OK': (r) => r.status === 200 });

  const seatMapRes = http.get(`${BASE_URL}/shows/${showId}/seat-map`, {
    tags: { name: 'seatmap' },
  });
  seatMapDuration.add(seatMapRes.timings.duration);
  check(seatMapRes, { 'seat-map OK': (r) => r.status === 200 });

  // Everyone wants a seat from the same small pool -- the actual
  // contention this scenario exists to create.
  const seatId = seatIds[Math.floor(Math.random() * seatIds.length)];
  const userId = `vu-${__VU}-${__ITER}`;
  const idempotencyKey = `${userId}-${Date.now()}`;

  const bookRes = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ userId, showId, seatIds: [seatId] }),
    { headers: { ...headers, 'Idempotency-Key': idempotencyKey }, tags: { name: 'initiate_booking' } },
  );

  if (bookRes.status === 201) {
    bookingSuccess.add(1);
    const bookingId = bookRes.json('booking').id;
    const payRes = http.post(
      `${BASE_URL}/bookings/${bookingId}/payment`,
      JSON.stringify({ outcome: 'SUCCESS', idempotencyKey: `${idempotencyKey}-pay` }),
      { headers, tags: { name: 'confirm_payment' } },
    );
    if (payRes.status === 200) {
      paymentSuccess.add(1);
    }
  } else if (bookRes.status === 409) {
    bookingConflict.add(1); // expected: someone else won this seat first
  } else {
    bookingOtherError.add(1);
  }

  sleep(Math.random() * 0.5); // think time, so VUs don't request in lockstep
}
