# Load testing

**Status: written and reviewed, not yet run.** Docker Desktop's backend
was unavailable throughout this project's development in this environment
(see the root README's "Known gaps" section), so there is no live
`core-api` to point k6 at. This README is the exact procedure to produce
real results once Docker is available — follow it once, then paste the
real numbers into `RESULTS.md` (a template, not invented data, lives next
to this file).

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally.
- The full stack running: `docker compose up -d --build` (see root
  README).
- `jq` (used by the seat-map integrity check below).

## 1. Baseline run — cache disabled

```
docker compose up -d --build --force-recreate -e CACHE_ENABLED=false core-api-1 core-api-2
# (or: edit docker-compose.yml's `CACHE_ENABLED` to "false" and
#  `docker compose up -d --build core-api-1 core-api-2`)

k6 run k6/flash-sale.js --env SEAT_COUNT=500 --env MAX_VUS=500
```

Record the summary k6 prints at the end (p95/p99 for `browse_duration` and
`seatmap_duration`, `http_reqs` total, `booking_success` /
`booking_conflict_409` counts) into `RESULTS.md` under "Without cache".

## 2. Comparison run — cache enabled

```
# set CACHE_ENABLED back to "true" and recreate the two core-api containers
docker compose up -d --build --force-recreate core-api-1 core-api-2

k6 run k6/flash-sale.js --env SEAT_COUNT=500 --env MAX_VUS=500
```

Record the same numbers into `RESULTS.md` under "With cache". The
`browse`/`seatmap` p95/p99 improvement (or lack of one, at this VU count —
see the note in `RESULTS.md` about when caching actually starts to matter)
is the real, measured comparison this project's caching ADR claims.

## 3. Pushing toward the stated "10K concurrent users" NFR

`MAX_VUS=500` is a laptop-safe default. Raising it meaningfully needs:

- More k6 VUs: `--env MAX_VUS=10000` (k6 itself handles high VU counts
  fine on modest hardware since VUs are cooperatively scheduled, not one
  OS thread each).
- `core-api`'s Node process and Postgres connection pool sized to handle
  the resulting connection count — the defaults in this repo are not tuned
  for 10K concurrent connections, and this is an explicit "at 100x scale"
  item in `docs/HLD.md`, not something fixed here.
- The host OS's open-file/connection limits raised accordingly.

Record whatever VU count was actually achievable and stable in
`RESULTS.md` — do not report `MAX_VUS=10000` if the run didn't actually
hold that load without the error budget blowing out.

## 4. Verifying zero double-booking after the run

The k6 script's own `booking_conflict_409` counter proves the *application*
never reports two successes for one seat, but the strongest proof is
checking the seat-map directly after the run — every seat should be either
`AVAILABLE` (nobody got it) or `BOOKED` (exactly one booking confirmed it),
never anything inconsistent:

```
curl -s localhost:3000/shows/<SHOW_ID_FROM_SETUP>/seat-map | \
  jq '[.[] | .status] | group_by(.) | map({status: .[0], count: length})'
```

Cross-check against Postgres directly: the number of `BOOKED` seats must
equal the number of `CONFIRMED` bookings for that show, and no seat ID
should appear in more than one `CONFIRMED` booking's `seatIds` array.

## What's already verified without a live server

The *mechanism* this load test exercises under real HTTP/network
conditions is already proven under concurrency at the application level,
without Docker:

- `SeatHoldConcurrency.spec.ts` (`@etp/domain`) — 500 concurrent in-process
  callers racing one seat, exactly zero or one winner depending on
  implementation.
- `catalog-cache.service.spec.ts`'s stampede-protection test — 20
  concurrent cache misses compute exactly once.
- `idempotency.e2e.spec.ts` — 10 concurrent identical requests, exactly
  one executes.

What a real k6 run adds that those can't: actual network/HTTP overhead,
real Postgres/Redis/Kafka round trips, and the actual p95/p99 numbers this
project's resume bullets and "at 100x scale" discussion depend on.
