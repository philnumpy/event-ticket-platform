# Event Ticket Booking Platform

A BookMyShow-style event ticket booking platform, built as a system-design
portfolio project. Every non-trivial decision is documented as an ADR in
[docs/adr](docs/adr) so the project can be defended in a system design
interview, not just demoed.

**Status:** Phase 2 of 5 (persistence + concurrency control) — see
[docs/LLD.md](docs/LLD.md) and [docs/adr](docs/adr) as they land, phase by
phase. [docs/HLD.md](docs/HLD.md) lands in Phase 5.

## Stack

Node.js 22 (LTS) + TypeScript, NestJS, PostgreSQL, Redis, Kafka, Docker
Compose, Nginx. Tests with Jest + Testcontainers; load testing with k6.

## Why this project

Demonstrates zero-double-booking under concurrency, a flash-sale-scale
read path, idempotent booking/payment APIs, a saga across service
boundaries with compensating actions, and graceful degradation when
downstream services fail — the full loop from HLD capacity math to LLD
class design to load-test evidence.

## Running it

```
npm install
docker compose up -d postgres redis      # local Postgres + Redis
cp .env.example packages/persistence/.env
npm run --workspace packages/persistence prisma:generate
npx prisma db push --schema packages/persistence/prisma/schema.prisma
npm run build                            # builds @etp/domain, @etp/persistence
npm test                                 # unit tests (all packages)
npm test --workspace packages/persistence  # + Testcontainers integration tests
```

Testcontainers integration tests spin up their **own** ephemeral Postgres
and Redis containers — independent of `docker compose up` — so Docker just
needs to be running, not the compose stack specifically.

