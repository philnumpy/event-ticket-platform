# ADR 0003: Payment idempotency via claim-then-process

**Status:** Accepted
**Date:** 2026-09-28

## Context

The mock payment gateway is explicitly required to send duplicate
callbacks. The first implementation of `confirmPayment` handled this with
the obvious approach: `findByIdempotencyKey`, and if nothing came back,
process the payment and save it under that key.

That's the exact same shape of bug ADR 0002 fixes for seats: a
check-then-act pair across two round trips. Two *concurrent* duplicate
callbacks for the same idempotency key can both call `findByIdempotencyKey`
before either has saved anything, both observe "not found," and both fall
through to processing — for payments, that means both would attempt to
transition the same `ShowSeat` from `HELD` to `BOOKED` using the same
`holdId`. The first succeeds; the second's `tryTransition` correctly
reports failure (the seat is no longer `HELD`) — but naively, the second
caller would then interpret that as a **finalization failure** on a
booking that actually succeeded, incorrectly cancelling it.

## Decision

Replace the check-then-act pair with `PaymentRepository.claim()`: a single
atomic "insert or tell me who got there first."

- **In-memory:** synchronous check-and-set on the `idempotencyKey` map —
  atomic because nothing `await`s between the check and the write, the same
  reasoning `InMemoryShowSeatRepository.tryTransition` relies on.
- **Postgres:** a plain `INSERT` into a column with a `UNIQUE` constraint on
  `idempotencyKey`. Two concurrent duplicate `create()` calls race
  Postgres's own unique-index enforcement, not application code — exactly
  one succeeds, the other fails with a `P2002` conflict, which
  `PrismaPaymentRepository.claim()` translates into "read the winner's row
  and return it."

`BookingApplicationService.confirmPayment` now claims *before* doing any
business logic. The caller that wins the claim is the only one that ever
touches `ShowSeat` or `Booking` state for this payment attempt. Every other
caller — genuine retries, duplicate gateway callbacks, or a true concurrent
race — calls `awaitSettledPayment`, which polls the claimed row for up to
~500ms (20 × 25ms) waiting for it to leave `PENDING`, then returns whatever
it finds.

## Consequences

- A caller that loses the claim while the winner is still mid-flight waits
  briefly rather than reprocessing. If the winning process crashes before
  settling the payment, losers give up after ~500ms and return a `PENDING`
  row rather than hanging indefinitely — acceptable for this platform's
  scope, but a production system would pair this with a reconciliation job
  that resolves stuck-`PENDING` payments (e.g. by querying the payment
  gateway directly). Noted in `docs/HLD.md`'s "at 100x scale" section rather
  than implemented here.
- `Payment` rows are now created in `PENDING` status and updated in place,
  rather than being constructed fully-formed before their first save. This
  is a deliberate trade: a slightly less "pure" construction flow in
  exchange for a real atomicity guarantee under concurrency.
- Proven by `BookingApplicationService.spec.ts`'s "20 concurrent duplicate
  payment callbacks" test (in-memory) and re-proven against real Postgres
  via Testcontainers in `packages/persistence/test`.
