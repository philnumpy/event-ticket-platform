# ADR 0001: Stack and service boundaries

**Status:** Accepted
**Date:** 2026-09-28

## Context

The platform needs to demonstrate both HLD (capacity, scaling, async flows,
sagas) and LLD (design patterns, concurrency, clean layering) for a system
design interview, while actually running on a single laptop via Docker
Compose. Every stack choice below had a viable alternative; this records
why each one was picked instead.

## Decisions

### Node.js + TypeScript + NestJS, not Express

NestJS's DI container makes the LLD pattern checklist (Strategy, State,
Factory, Observer, Repository/Service layering) idiomatic to demonstrate
rather than hand-rolled — a `@Injectable()` provider bound to an interface
token *is* dependency inversion, visibly, in the framework's own idiom.
Express would work but requires more boilerplate to get the same
separation, which would read as incidental complexity rather than
intentional design in an interview walkthrough.

### Kafka, not BullMQ/RabbitMQ

The requirements call for an outbox pattern, consumer groups, retries with
a dead-letter queue, and a sharding/partition-key discussion — all
Kafka-native concepts with direct systems-design interview relevance.
BullMQ (Redis-backed) is simpler operationally but doesn't have partitions
or consumer-group semantics to reason about, which would flatten the async
section of the HLD write-up.

### Prisma, wrapped behind hand-written repository interfaces

Prisma gives type-safe queries and migrations without hand-writing a query
builder. Critically, `@etp/domain`'s repository *ports* are plain
TypeScript interfaces with zero Prisma imports — `@etp/persistence`
implements them. This means the Repository pattern deliverable is a real
architectural boundary (verified by running the *same* domain test suite
against in-memory adapters in Phase 1 and Testcontainers-backed Prisma
adapters in Phase 2), not just "Prisma is my repository."

### Modular monolith (`core-api`) + two satellite services, not N microservices and not one monolith

`core-api` owns catalog, inventory, booking, and admin — these share
transactions and need strong consistency (a booking and its seat-inventory
mutation must commit together), so splitting them into separate services
would just add network calls around what is fundamentally one transaction
boundary. `payment-service` and `notification-service` are separate
processes because both need to be independently killable: the chaos test
requires stopping payment mid-flow without stopping the rest of the
platform, and "graceful degradation if payment or notification services are
down" is an explicit NFR that only means something if they're separate
failure domains.

### Saga orchestration, not choreography

An explicit `BookingSagaOrchestrator` (Phase 3) is a single class an
interviewer can be walked through step by step: booking → payment →
finalize, with named compensating actions at each failure point.
Choreography (each service reacting to the previous one's event) avoids a
central coordinator but scatters the actual business process across
subscriber handlers in three services, which is harder to defend under
questioning ("what's the state of a booking that's failed at step 2?")
even though it's the more common approach at very large scale where a
single orchestrator would centralize too much load.

## Consequences

- Domain logic has zero framework dependency, which cost extra mapping code
  in `@etp/persistence` (Prisma rows ↔ domain entities) but keeps
  `@etp/domain`'s 100+ tests running in milliseconds with no infrastructure.
- Three deployable units (`core-api`, `payment-service`,
  `notification-service`) plus Postgres, Redis, Kafka, and Nginx is the
  full local stack — sized to run on a laptop via `docker-compose up`.
