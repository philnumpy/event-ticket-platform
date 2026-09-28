# Chaos test: payment-service down mid-booking

**Claim being tested:** if `payment-service` is unreachable for the entire
lifetime of a booking attempt, the platform still ends up in a correct
state — the seat is not lost, the customer is not charged, and no manual
intervention is required. See
[ADR 0004](adr/0004-outbox-and-async-delivery.md) for why this works
through the hold TTL rather than an explicit saga compensation step.

## What actually happens, step by step

1. `POST /bookings` runs `BookingApplicationService.initiateBooking`,
   which acquires the seat hold and publishes `SEATS_HELD` — all of this
   is local to `core-api` and Redis/Postgres, so it succeeds regardless of
   payment-service's health.
2. `BookingSagaService` reacts to `SEATS_HELD` by publishing a
   `payment.requested` Kafka message. This succeeds too — Kafka accepted
   the message, there just happens to be no consumer group running to pick
   it up.
3. Nothing consumes `payment.requested`. The booking sits in `HELD`.
4. `HoldExpirySweep` (started by `DomainModule.onModuleInit`, polling
   every `HOLD_SWEEP_INTERVAL_MS`) finds the hold once its TTL
   (`HOLD_TTL_SECONDS`) elapses, calls
   `BookingApplicationService.expireHold`, which:
   - releases the seat (`ShowSeat` back to `AVAILABLE` via the same
     `tryTransition` conditional update used everywhere else), and
   - transitions the booking to `EXPIRED`.
5. If payment-service comes back later and finally processes that
   `payment.requested` message, `BookingSagaService.handleGatewayResponse`
   calls `confirmPayment`, which finds the hold already expired
   (`HoldExpiredError`) and does nothing further — logged, not treated as
   a processing failure. No stale charge, no state corruption.

## Running it

```
./scripts/chaos-test.sh
```

The script starts Postgres, Redis, Kafka, `core-api`, and
`notification-service` via `docker compose` — deliberately **not**
`payment-service` — with a short `HOLD_TTL_SECONDS`/`HOLD_SWEEP_INTERVAL_MS`
override so the test finishes in under a minute instead of the default
5-minute hold window. It provisions a venue/seat/event/show, initiates a
booking, waits past the hold TTL, and asserts the booking reaches
`EXPIRED` and the seat is `AVAILABLE` again.

## Status

This script is written against the actual, tested API surface (the same
endpoints `services/core-api/test/*.e2e.spec.ts` exercise) but has not yet
been run against real infrastructure in this environment — Docker
Desktop's backend was unavailable for the duration of this project's
development (see the root README). Until it's run once for real, treat it
as reviewed, not verified.

What **is** already verified, without Docker, is every piece this chaos
test depends on, individually:

- `HoldExpirySweep` correctly expires a stale hold and frees the seat —
  `packages/persistence/test/HoldExpirySweep.spec.ts` (in-memory, 5 tests).
- The saga correctly calls `confirmPayment` in reaction to a simulated
  gateway response, including the duplicate-callback case —
  `services/core-api/test/booking-saga.e2e.spec.ts`.
- `confirmPayment` correctly handles an already-expired hold —
  `packages/domain/test/services/BookingApplicationService.spec.ts`
  ("expires a hold that outlives its TTL...").

The chaos test's job is to prove these compose correctly end-to-end with a
real Kafka broker and real service processes — the one thing that can't be
verified by any of the above individually.
