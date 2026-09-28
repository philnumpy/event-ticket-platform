# ADR 0002: Seat-hold concurrency control

**Status:** Accepted
**Date:** 2026-09-28

## Context

The platform's hardest correctness requirement: zero double-booking of a
seat, even with ~10K concurrent users hammering one popular show during a
flash sale. Phase 1 proved the *shape* of the bug in-memory
(`SeatHoldConcurrency.spec.ts`: a naive check-then-act hold lets all 500
concurrent callers "succeed" against the same seat) and fixed it with an
in-process mutex. That fix doesn't survive the move to a real, horizontally
scaled service — an in-process mutex only serializes callers within one
Node process, and `core-api` runs multiple replicas behind Nginx. This ADR
is the real fix.

## Options considered

**(a) DB row locking — `SELECT ... FOR UPDATE` then `UPDATE`.**
Correct: the row lock is held from the `SELECT` until the transaction
commits, so a second transaction's `SELECT ... FOR UPDATE` on the same row
blocks until the first commits or rolls back. But it needs two round trips
(`SELECT`, then `UPDATE`) with the lock held across the gap between them —
under flash-sale contention on a single row, that's `N` transactions queued
in lock-wait order, each holding a connection-pool slot for the full
round-trip time. At 10K concurrent requests for one seat, this exhausts the
connection pool and turns a seat-hold into the platform's queuing
bottleneck.

**(b) Optimistic locking — a `version` column, `UPDATE ... WHERE version = $expected`.**
Same round-trip-count problem in the classic form (read version, then
conditionally update) unless the "read" is folded into the same statement
as the "write." The insight this ADR relies on: **a conditional `UPDATE ...
WHERE status = 'AVAILABLE'` *is* optimistic locking, using `status` itself
as the version discriminator**, in a single round trip. A separate integer
`version` column is unnecessary here because `ShowSeat`'s valid states
(`AVAILABLE` / `HELD` / `BOOKED`) are already mutually exclusive — there's
no scenario where two different valid updates could both legally apply to
the same `status` value, which is the only case a generic version column
is needed for.

**(c) Redis distributed lock (`SET NX PX`).**
Resolves the contention problem — Redis's single-threaded command loop
serializes `SET NX` attempts on the same key in microseconds regardless of
how many callers arrive at once, so it's a natural fit for the flash-sale
spike. But Redis is not the platform's durability boundary: without
fsync-per-write tuning (which trades away most of Redis's throughput
advantage), a lock key can be lost on restart or failover. A lost lock with
nothing else checking is a real double-booking, with a real refund/chargeback
cost — not an acceptable sole guarantee for this NFR.

## Decision

**Redis `SET NX PX` as a fast-fail admission filter, backed by a single
atomic Postgres conditional `UPDATE` as the actual correctness guarantee.**
This is (c) for throughput plus (b)'s single-statement form for correctness
— not a compromise between them, but using each for the property it's
actually good at:

```
RedisSeatHoldService.hold(showId, seatId, holdId):
  1. SET seatlock:{showId}:{seatId} holdId NX PX <ttl>
     -> not OK: fail fast, never touch Postgres        (contention absorption)
  2. UPDATE show_seats SET status='HELD', "holdId"=$holdId
     WHERE "showId"=$showId AND "seatId"=$seatId AND status='AVAILABLE'
     -> 0 rows affected: release the Redis key, fail    (correctness guarantee)
     -> 1 row affected: done
```

Implementation: `RedisSeatHoldService` (`packages/persistence/src/redis`)
and `PrismaShowSeatRepository.tryTransition`
(`packages/persistence/src/repositories`), both implementing the exact same
`SeatHoldService` / `ShowSeatRepository` ports Phase 1 defined —
`BookingApplicationService` does not change at all.

Structurally, `ShowSeat`'s composite primary key `(showId, seatId)` already
guarantees there is exactly one inventory row per seat per show, so there
is no way for two `BOOKED` rows to exist for the same seat — the entire
concurrency problem is safely mutating *that one row's* status, which the
conditional `UPDATE` solves without any additional unique constraint.

**Isolation level:** the default `READ COMMITTED` is sufficient. Every
mutation to `ShowSeat` is a single self-contained statement (`tryTransition`
never reads then decides across a second statement within the same
transaction), so there's no phantom-read or non-repeatable-read anomaly for
a stricter isolation level to prevent. `SERIALIZABLE` would only be needed
if a transaction had to make a decision based on a multi-statement view of
the data that must not change underneath it — `tryTransition` never does.

**Why not skip Redis and rely on the conditional `UPDATE` alone?** It's
already double-booking-safe by itself. Redis is purely a throughput
optimization: it turns "10,000 requests queue on one Postgres row" into
"9,999 requests fail in Redis in microseconds, 1 request touches Postgres."
Without it, the conditional `UPDATE` is still correct, just slower under
extreme contention (Postgres row-lock wait time replaces Redis's near-zero
rejection time).

## A residual race, and how it's closed

A hold's Redis key and its Postgres row can disagree at the margins — e.g.
a process crashes after the Redis `SET NX` succeeds but before the Postgres
`UPDATE` runs. `RedisSeatHoldService` handles this by releasing the Redis
key whenever the Postgres step doesn't confirm success (see the `finally`
block), so a crash leaves at worst a seat that's briefly unavailable in
Redis but still correctly `AVAILABLE` in Postgres — self-healing once the
Redis key's TTL expires, never a phantom double-booking.

A second, easy-to-miss race: the hold-expiry sweep (`HoldExpirySweep`)
releasing a seat at the exact moment a late payment confirmation tries to
finalize it. Both are conditional transitions guarded by `status = 'HELD'
AND "holdId" = $holdId` — whichever one's `UPDATE` commits first wins, and
the other's `WHERE` clause no longer matches, so it safely no-ops instead of
corrupting state. This is why **every** `ShowSeat` mutation in
`BookingApplicationService` goes through `tryTransition`, not just seat
acquisition — see `InMemoryShowSeatRepository.spec.ts`'s
"sweep-vs-payment race" test for the same guarantee proven in-memory.

## Consequences

- `ShowSeatRepository.save()` / `saveMany()` are reserved for seeding
  inventory only; every lifecycle mutation goes through `tryTransition`.
  This is enforced by convention and documented on the interface, not by
  the type system — a real code-review checkpoint, not a limitation of the
  chosen design.
- The 500-caller concurrency test from Phase 1 is re-run against the real
  Postgres + Redis stack via Testcontainers
  (`packages/persistence/test/SeatHoldConcurrency.integration.spec.ts`),
  proving the same "zero double-booking" property holds with the real
  infrastructure, not just the in-memory stand-in.
- At 100x scale, the next bottleneck is Postgres write throughput on the
  busiest show's `show_seats` rows even with Redis absorbing read
  contention — addressed in `docs/HLD.md`'s scaling section (sharding by
  `showId`).
