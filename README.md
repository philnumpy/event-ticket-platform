# Event Ticket Booking Platform

A BookMyShow-style event ticket booking platform, built as a system-design
portfolio project. Every non-trivial decision is documented as an ADR in
[docs/adr](docs/adr) so the project can be defended in a system design
interview, not just demoed.

**Status:** Phase 3 of 5 (caching, async delivery, saga) — see
[docs/LLD.md](docs/LLD.md) and [docs/adr](docs/adr) as they land, phase by
phase. [docs/HLD.md](docs/HLD.md) lands in Phase 5.

## Stack

Node.js 22 (LTS) + TypeScript, NestJS (`core-api`), PostgreSQL, Redis,
Kafka, Docker Compose, Nginx (Phase 4). Tests with Jest + Testcontainers;
load testing with k6 (Phase 5).

## Why this project

Demonstrates zero-double-booking under concurrency, a flash-sale-scale
read path, idempotent booking/payment APIs, a saga across service
boundaries with compensating actions, and graceful degradation when
downstream services fail — the full loop from HLD capacity math to LLD
class design to load-test evidence.

## Packages and services

```
packages/
  domain/         Pure business logic — entities, state machine, strategies,
                   validation chain, domain events, repository ports +
                   in-memory adapters. Zero framework/DB dependency.
  persistence/     Prisma + Redis implementations of @etp/domain's ports.
  messaging/       Outbox pattern + Kafka producer/consumer (retry + DLQ).
services/
  core-api/            NestJS: catalog, booking, admin HTTP APIs + the
                        booking saga orchestrator.
  payment-service/     Mock payment gateway (Kafka consumer/producer).
  notification-service/  Kafka consumer -> mocked notification delivery.
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

This brings up Postgres, Redis, a single-node Kafka broker (KRaft mode),
`core-api` (port 3000), `payment-service`, and `notification-service`.
`core-api`'s container runs `prisma db push` against the compose Postgres
on startup — there are no versioned migrations yet (see
`services/core-api/Dockerfile`).

Provision a show and book a seat:

```
VENUE=$(curl -s -X POST localhost:3000/admin/venues \
  -H 'Content-Type: application/json' \
  -d '{"name":"PVR Saket","city":"Delhi","address":"Saket"}' | jq -r .id)
curl -s -X POST localhost:3000/admin/venues/$VENUE/seats \
  -H 'Content-Type: application/json' \
  -d '{"seats":[{"section":"A","row":"A","seatNumber":1,"tier":"GOLD"}]}'
# ...see docs/chaos-test.md for the full provisioning + booking sequence.
```

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

## Known gaps in this environment

Docker Desktop's backend was unavailable for large parts of this project's
development (WSL2 had no installed distributions on the dev machine). Code
that depends on it — `packages/persistence`'s Testcontainers suite
(`Persistence.integration.spec.ts`), the full `docker compose up` stack,
and the chaos test — is written, reviewed, and type-checked, but not yet
run end-to-end. Everything else is green and runs on in-memory/fake
adapters with no external infrastructure: 203 tests across `domain` (140),
`messaging` (11), `persistence`'s Docker-free suite (5), `core-api` (21),
`payment-service` (13), and `notification-service` (13).
