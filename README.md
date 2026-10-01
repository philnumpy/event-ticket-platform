# Event Ticket Booking Platform

A BookMyShow-style event ticket booking platform, built as a system-design
portfolio project. Every non-trivial decision is documented as an ADR in
[docs/adr](docs/adr) so the project can be defended in a system design
interview, not just demoed. **Start with [docs/HLD.md](docs/HLD.md)** —
capacity math, architecture, scaling, "at 100x scale," and 10 interview
talking points, all in one place. [docs/README.md](docs/README.md) indexes
everything else.

**Status:** All 5 planned phases complete (domain model → persistence →
caching/async/saga → gateway/resilience/observability → load-test tooling
and documentation). See [docs/LLD.md](docs/LLD.md) for the phase-by-phase
build log.

## Stack

Node.js 22 (LTS) + TypeScript, NestJS (`core-api`), PostgreSQL, Redis,
Kafka, Docker Compose, Nginx. Tests with Jest + Testcontainers; load
testing with k6.

## Why this project

Demonstrates zero-double-booking under concurrency, a flash-sale-scale
read path, idempotent booking/payment APIs, a saga across service
boundaries with compensating actions, and graceful degradation when
downstream services fail — the full loop from HLD capacity math to LLD
class design to load-test tooling (results pending real infrastructure —
see "Known gaps" below).

## Packages and services

```
packages/
  domain/         Pure business logic — entities, state machine, strategies,
                   validation chain, domain events, repository ports +
                   in-memory adapters. Zero framework/DB dependency.
  persistence/     Prisma + Redis implementations of @etp/domain's ports.
  messaging/       Outbox pattern + Kafka producer/consumer (retry + DLQ).
services/
  core-api/            NestJS: catalog, booking, admin HTTP APIs, the
                        booking saga orchestrator, rate limiting,
                        idempotency-key middleware, circuit breakers,
                        structured logging, Prometheus metrics.
  payment-service/     Mock payment gateway (Kafka consumer/producer).
  notification-service/  Kafka consumer -> mocked notification delivery.
nginx/            Gateway config: load balancing + coarse rate limiting
                  in front of two core-api replicas.
k6/               Load test scripts + results template (see "Known gaps").
docs/             HLD, LLD, 6 ADRs, OpenAPI spec, chaos test writeup.
```

## Running it

### Libraries only (no Docker needed beyond Postgres/Redis for persistence's own tests)

```
npm install
npm run build     # builds every package/service in dependency order
npm test          # domain + messaging + core-api + payment-service + notification-service
```

`npm test` at the root also runs `packages/persistence`'s Testcontainers
suite, which needs Docker running (see below) and will hang without it.
Run `npm test --workspace packages/domain` etc. individually to skip it.

### The full system

```
docker compose up -d --build
```

(`.env.example` is for connecting *from the host* to the compose-exposed
Postgres/Redis ports during local development — `docker-compose.yml`
itself hardcodes inter-container URLs and doesn't need it.)

This brings up Postgres, Redis, a single-node Kafka broker (KRaft mode), a
one-shot `migrate` job (Prisma schema sync — see
`services/core-api/Dockerfile` for why this isn't part of the app image's
own startup), two `core-api` replicas, Nginx in front of them (port 3000),
`payment-service`, and `notification-service`.

Provision a show and book a seat:

```
VENUE=$(curl -s -X POST localhost:3000/admin/venues \
  -H 'Content-Type: application/json' \
  -d '{"name":"PVR Saket","city":"Delhi","address":"Saket"}' | jq -r .id)
curl -s -X POST localhost:3000/admin/venues/$VENUE/seats \
  -H 'Content-Type: application/json' \
  -d '{"seats":[{"section":"A","row":"A","seatNumber":1,"tier":"GOLD"}]}'
# ...full sequence, and the OpenAPI spec for every endpoint, in
# docs/openapi.yaml and docs/chaos-test.md.
```

Add an `Idempotency-Key: <uuid>` header to any POST to get safe-retry
semantics; requests are also rate-limited per client IP (token bucket,
`services/core-api/src/common/rate-limit`), returning `429` once exhausted.
Every response carries an `X-Correlation-Id` header (reuse your own by
sending it as a request header); `GET /metrics` exposes Prometheus text
format for `core-api`.

### Testcontainers integration tests

```
npm test --workspace packages/persistence
```

Spins up its **own** ephemeral Postgres and Redis containers, independent
of `docker compose up` — Docker just needs to be running.

### Chaos test

```
./scripts/chaos-test.sh
```

Kills `payment-service` for a booking's entire lifetime and proves the hold
TTL correctly compensates. See [docs/chaos-test.md](docs/chaos-test.md).

### Load testing

```
k6 run k6/flash-sale.js --env SEAT_COUNT=500 --env MAX_VUS=500
```

Flash-sale scenario: a fixed small seat pool contended by many concurrent
VUs, p95/p99 thresholds on the read path, a with/without-cache comparison
via `CACHE_ENABLED`. Full procedure in [k6/README.md](k6/README.md);
results template (unfilled — see "Known gaps") in
[k6/RESULTS.md](k6/RESULTS.md).

## Known gaps in this environment

Docker Desktop's backend was unavailable for this entire project's
development (WSL2 had no installed distributions on the dev machine, and
fixing that needs admin-level system changes this assistant didn't make
unilaterally). Code that depends on it is **written, reviewed, and type-
checked, but not run end-to-end**:

- `packages/persistence`'s Testcontainers suite (`Persistence.integration.spec.ts`)
- The full `docker compose up` stack — structurally validated via
  `docker compose config` (parses and resolves cleanly, including the
  two-replica/Nginx/migrate-service topology) but never actually started
- `scripts/chaos-test.sh`
- `k6/flash-sale.js` — **no real p95/p99/throughput numbers exist for this
  project.** `k6/RESULTS.md` is a template with every cell blank, not an
  estimate. Don't trust any load-test number for this project that isn't
  in that file with a real date next to it.

Everything else is green and runs on in-memory/fake adapters with no
external infrastructure: **263 tests** across `domain` (140), `messaging`
(17), `persistence`'s Docker-free suite (5), `core-api` (73),
`payment-service` (15), and `notification-service` (13).

## Resume bullets

Pulled only from the numbers above and from the project's actual scope —
nothing here is a load-test claim, because no load test has run yet:

- Designed and built a 6-service event-ticketing platform (3 shared
  libraries + 3 deployable services) demonstrating zero-double-booking
  under concurrency, with the core correctness property proven by
  dedicated tests: 500 concurrent callers racing one seat hold (naive
  check-then-act implementation lets more than one succeed; the shipped
  Redis-+-Postgres design lets exactly 1 through, 499 correctly rejected),
  20 concurrent duplicate payment-gateway
  callbacks deduplicated to exactly 1 processed, and 10 concurrent
  identical API requests collapsed to exactly 1 execution via a generic
  idempotency-key mechanism.
- Implemented an async saga (Kafka, transactional-outbox event delivery,
  retry-with-dead-letter-queue consumers) coordinating booking → payment →
  confirmation across 3 independent processes, with a hold-TTL-based
  compensating action verified by a dedicated test suite
  (`HoldExpirySweep.spec.ts`) rather than bespoke rollback code.
- Wrote 6 Architecture Decision Records and a full HLD/LLD documentation
  set (capacity estimation, sharding strategy, OpenAPI spec) defending
  every non-trivial design choice, including 3 real bugs found and fixed
  during development (two TOCTOU/aliasing races in test doubles, one
  compensating-action integration gap caught only by writing the chaos
  test) — each documented with root cause in the relevant ADR/commit, not
  glossed over.
- Built resilience primitives (circuit breaker with timeout/backoff, a
  true token-bucket rate limiter with a Lua-script Redis backend) from
  first principles rather than a library, each with graceful-degradation
  fallback behavior proven by tests that fail the dependency on demand.
- 263 automated tests (unit + integration + end-to-end) across the whole
  system, all passing, zero flaky tests, achieved without any external
  infrastructure running — every repository/cache/broker dependency is
  swappable behind a port, with an in-memory or fake adapter for tests and
  a real one (Postgres/Redis/Kafka) for production, verified identically
  on both.
