# Event Ticket Booking Platform

A BookMyShow-style event ticket booking platform, built as a system-design
portfolio project. Every non-trivial decision is documented as an ADR in
[docs/adr](docs/adr) so the project can be defended in a system design
interview, not just demoed.

**Status:** scaffolding — see [docs/HLD.md](docs/HLD.md) and
[docs/LLD.md](docs/LLD.md) as they land, phase by phase.

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

Docker Compose instructions land in Phase 2+ once there's a real stack to
run.
