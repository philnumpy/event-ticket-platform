# ADR 0004: Outbox pattern, async delivery, and the booking saga

**Status:** Accepted
**Date:** 2026-09-29

## Context

Two things need to reach other processes reliably: domain events (so
notification-service can act on a confirmed/cancelled booking) and the
payment request/response round trip with payment-service. Both need to
survive the publishing process crashing partway through, and both need to
tolerate Kafka being briefly unavailable without losing data or corrupting
booking state.

## The dual-write problem, and why a plain publish() call doesn't solve it

If `BookingApplicationService` saved a booking to Postgres and then called
a Kafka producer directly, a crash between those two operations loses the
event forever — the booking row commits, nothing ever tells
notification-service about it. This is the classic dual-write problem, and
it's exactly what the outbox pattern exists to close: write the event to a
table in the same database as the business data, and let something else
relay it from there.

## Decision: OutboxEventPublisher + OutboxRelay, with an explicit, documented atomicity gap

`OutboxEventPublisher` is an Observer on the same `DomainEventPublisher`
every other subscriber (cache invalidation, the saga, Phase 1's
`NotificationDispatcher`) uses — it just writes whatever event it receives
into an `outbox_events` table. `OutboxRelay` is a separate poller that
reads unpublished rows, forwards them to Kafka, and marks them published,
retrying failures with a bounded attempt budget before dead-lettering a
row that never succeeds (excluded from further attempts, kept for
inspection — see `packages/messaging/src/outbox/OutboxRelay.ts`).

**This is not a fully rigorous transactional outbox**, and that's a
deliberate, scoped trade-off, not an oversight:

- A true transactional outbox requires the outbox insert to commit in the
  *same database transaction* as the business row it describes (e.g. one
  `prisma.$transaction([bookingUpsert, outboxInsert])` call). Getting
  there would mean `BookingApplicationService` — which is deliberately
  persistence-agnostic, the same code runs against in-memory repositories
  in every Phase 1/2 test — would need to either take on a `UnitOfWork`
  abstraction wrapping every multi-repository write, or stop being
  persistence-agnostic. Either is a bigger, more invasive change than this
  project's remaining scope justifies for the marginal correctness gain.
- The actual gap this leaves: if the process crashes in the narrow window
  between `bookings.save()` returning and `OutboxEventPublisher`'s insert
  completing, that one event is lost. Every other subscriber on the same
  `publish()` call (cache invalidation, the saga) already ran by that
  point since they're synchronous, in-process, and ordered before the
  outbox write in the subscriber list — only cross-process delivery via
  Kafka is exposed to this gap.
- **What would close it completely at higher scale:** Debezium (or
  equivalent) reading the Postgres WAL via CDC and publishing row inserts
  on the `outbox_events` table to Kafka directly, with no polling relay and
  no separate insert step to lose — the outbox row's own commit *is* the
  durability guarantee, full stop. This is the answer documented in
  `docs/HLD.md`'s "at 100x scale" section rather than implemented here: it
  requires running and operating a Debezium connector, which is
  infrastructure this project's scope (a demonstrable system on a laptop)
  doesn't need to carry for a gap this narrow.

Polling (1-second default interval) rather than Postgres `LISTEN/NOTIFY`:
simpler to reason about and test, at the cost of up to one poll interval
of added latency before an event reaches Kafka — acceptable for
notifications, and irrelevant to the payment flow (see below, which
doesn't go through the outbox at all).

## The payment request/response round trip deliberately bypasses the outbox

`BookingSagaService` publishes `payment.requested` directly from its
`SEATS_HELD` event handler, not through the outbox. This is intentional:
the outbox's job is reliably relaying facts about the past (a booking *was*
confirmed); a payment request is a command with its own, different
reliability story. If publishing it fails or the message is simply never
answered — payment-service is down, network partition, whatever — nothing
about the booking is wrong yet: it's still `HELD`, and `HoldExpirySweep`
(ADR from Phase 2) already compensates on a timeout by expiring the hold
and releasing the seat. Routing this command through the outbox would add
a mechanism (durable retry of the *request*) on top of one that already
exists and already produces the correct outcome (the hold TTL). The chaos
test below exercises exactly this path.

## Saga shape: orchestration, and why it needed almost no new code

`BookingSagaService` is deliberately thin: react to `SEATS_HELD` by
publishing a command; react to the response by calling
`BookingApplicationService.confirmPayment()` — the exact same method a
synchronous HTTP caller uses in the `POST /bookings/:id/payment` endpoint
kept from Phase 2. The saga's only real job is *deciding when* that call
happens and *with what outcome*, not reimplementing anything about what it
does. This is what let Phase 2's idempotency-claim logic get reused
verbatim for the mocked gateway's duplicate-callback behavior — the saga
consumer doesn't dedupe anything itself; it just calls `confirmPayment`
twice with the same `idempotencyKey`, and Phase 2 already handles that
correctly.

## Consequences

- `NotificationDispatcher` (Phase 1) is no longer wired into core-api's
  running composition; it remains fully tested in `@etp/domain` as the
  in-process Observer-pattern demonstration, superseded at runtime by
  `notification-service` reached through the outbox + Kafka.
- Every Kafka-touching piece in core-api (`KafkaEventPublisher`, the
  saga's `PaymentCommandPublisher` / `ResponseConsumer`) is injected via a
  DI token bound to an interface, precisely so tests can substitute a
  no-op and never need a live broker — the same "same ports, different
  adapter" discipline as every other boundary in this codebase.
- The **chaos test** (`docs/chaos-test.md`) kills `payment-service` mid-
  booking and asserts the hold expires and the seat frees up on schedule —
  proving the saga's *lack* of an explicit compensation step is a correct
  design choice, not a gap.
