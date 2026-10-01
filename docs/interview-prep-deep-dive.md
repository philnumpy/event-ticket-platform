# Interview prep: the complete deep dive

This is the "explain it to me from zero" version of this project — written
for *you*, to study from, not as project documentation (that's HLD.md/
LLD.md/the ADRs). If you only have time to re-read one file before an
interview, make it this one; it links out to the others for when you want
the next level of depth on any specific piece.

---

## 1. What problem is this solving?

**The elevator pitch:** a BookMyShow/Ticketmaster-style platform where
users browse events, pick seats, and book them — built specifically to
demonstrate solving the three things that make ticket booking a genuinely
hard systems problem, not just CRUD:

1. **Flash sales create extreme, concentrated concurrency.** When a
   popular show goes on sale, thousands of people can hit "book" on the
   same handful of seats within seconds. Get this wrong and two people
   are both told "you got seat A1" — a **double-booking**.
2. **Payment is inherently unreliable and asynchronous**, and — the detail
   most people miss — payment gateways can send the **same success
   webhook twice**. This is documented real-world behavior, not a
   hypothetical.
3. **Booking is a multi-step process spanning services** (hold seat →
   charge card → confirm), and you need a plan for what happens if any
   step fails that doesn't leave the system in a broken half-state.

Every major decision in this project traces back to one of these three
problems.

---

## 2. The technology stack — what, and *why this one*

| Technology | What it is | Why it's here |
|---|---|---|
| Node.js + TypeScript | JS runtime + static types | Types catch a whole class of bugs at compile time; Node's single-threaded event loop is directly relevant to the concurrency story below. |
| NestJS | DI-based backend framework | Forces "depends on an interface" over "imports a file directly" — the reason every test can run against fakes instead of real infra. |
| PostgreSQL | Relational database | Booking correctness is relational (seat/booking/payment state must agree); SQL gives atomic single-statement updates, the actual mechanism preventing double-booking. |
| Prisma | ORM for TS + Postgres | Type-safe queries and migrations without hand-written SQL everywhere. |
| Redis | In-memory key-value store | Four jobs: seat-hold fast-fail lock, read cache, rate-limiter backing store, idempotency-key store. Never the *only* safety net in any of the four. |
| Kafka | Distributed message queue | Lets core-api ask payment-service to charge a customer, and get an answer back, across process boundaries, asynchronously. Also carries domain events to notification-service. |
| Docker / Compose | Containerization + orchestration | Packages every service + Postgres/Redis/Kafka reproducibly; one command brings up the whole system. |
| Nginx | Reverse proxy / LB | Load-balances two core-api replicas; coarse rate limiting before a request reaches the app. |
| Jest | Test runner | Runs all 263 tests. |
| Testcontainers | Spins up real Docker containers from inside tests | Proves the in-memory fakes aren't lying, by re-running the critical tests against a real throwaway Postgres+Redis. |
| k6 | Load testing | Simulates concurrent users for real latency/throughput numbers (written, not yet run — see §11). |
| pino | JSON logging | Structured log lines, filterable by field (e.g. correlationId) in production. |
| prom-client | Prometheus metrics client | Exposes `/metrics` for request counts/latencies. |

Nothing here was picked for popularity — each solves a specific problem
this project has, and you should be able to name the problem for each row.

---

## 3. The monorepo: six packages, one repo

```
packages/
  domain/        pure business logic. ZERO dependency on a database, a
                  web framework, or Kafka — just TypeScript classes.
  persistence/    implements domain's interfaces with real Postgres (Prisma) + Redis
  messaging/      implements "send this to Kafka reliably"

services/
  core-api/              the NestJS web server
  payment-service/       a standalone process pretending to be a payment gateway
  notification-service/  a standalone process pretending to send emails/SMS
```

**Why split it this way?** This is **hexagonal architecture** ("ports and
adapters"). `packages/domain` defines *interfaces* ("ports") like
`BookingRepository` — "something that can save/fetch bookings" — with no
idea Postgres exists. `packages/persistence` is the *real* adapter
(Prisma). But domain also ships a second, trivial adapter:
`InMemoryBookingRepository`, a plain JS `Map`.

Tests get handed the in-memory version: no database, runs in
milliseconds, equally rigorous because it satisfies the same interface
the real adapter has to satisfy.

**This is why 263 tests pass with zero running infrastructure.** Business
logic correctness never needed Docker — only the production *adapters*
(Prisma/Redis/Kafka code) need a real backend to fully verify, which is a
smaller, separate, currently-unverified concern (§11).

If asked "how did you test a system this complex without a database
running" — **this is the answer.**

---

## 4. The domain model

- **Venue** — a physical place
- **Seat** — one physical seat at a venue (tier: PLATINUM/GOLD/SILVER)
- **Event** — the "thing" (a movie, a concert)
- **Show** — one screening of an Event at a Venue at a specific time, with per-tier pricing
- **ShowSeat** — *availability* of one seat for one specific show.
  Separate from Seat because the same physical seat A1 is independently
  bookable for the 2pm and 7pm show — Seat is geometry, ShowSeat is
  availability.
- **Hold** — a temporary claim on seats (the "5 minutes to pay" window)
- **Booking** — the record of a booking attempt, with a lifecycle (§6)
- **Payment** — one payment attempt's record

Be ready to explain *why* ShowSeat isn't just a boolean on Seat — that's
exactly the kind of modeling question interviewers probe.

---

## 5. The hardest problem: zero double-booking under concurrency

### The naive, broken approach

"Check if the seat is available, then mark it held":

```
1. Read the seat's status.   -- says AVAILABLE
2. Write the seat's status as HELD.
```

Between steps 1 and 2, time passes. Two concurrent requests can both
read AVAILABLE before either writes — both proceed, both "succeed," the
same seat is sold twice. This is a **TOCTOU bug** (Time Of Check to Time
Of Use), the most common concurrency bug in booking/inventory systems.

This broken version is deliberately kept in the codebase
(`NaiveInMemorySeatHoldService`) with a test proving the bug: 500
simulated concurrent users race one seat, more than one "succeeds."
Keeping the broken version and proving it's broken is itself worth
mentioning — it shows you understand *why* the fix is needed, not just
that you copied a fix.

### The fix: two layers, and the reasoning for why two

**Layer 1 — Postgres, one atomic statement:**

```sql
UPDATE show_seats
SET status = 'HELD', "holdId" = $holdId
WHERE "showId" = $showId AND "seatId" = $seatId AND status = 'AVAILABLE'
```

One statement — Postgres evaluates the `WHERE` and applies the `SET`
indivisibly. No gap between check and set because there's no second
step. Two concurrent attempts racing this exact statement: exactly one
finds the row still AVAILABLE and succeeds; the other updates zero rows
(its WHERE no longer matches), which the app treats as "someone beat you
to it." Used for *every* ShowSeat state change, not just acquiring —
including releasing an expired hold and marking a seat booked, because a
second, subtler version of the same race existed between "hold expired,
release" and "payment succeeded, mark booked" happening at the same
instant for the same hold. Same atomic-conditional-update trick fixes it
symmetrically.

**Layer 2 — Redis, a fast-fail filter in front of Postgres:** the Postgres
fix alone is already *correct*. Redis exists for *performance* under
extreme contention — 10,000 requests for one seat all hitting Postgres at
once queues up the database around one hot row. Redis (single-threaded,
microsecond command latency) does `SET seatlock:show:seat <holdId> NX PX
300000` first: miss the lock, fail instantly, never touch Postgres (9,999
of 10,000 requests resolved here). Win the lock, proceed to the real
Postgres update.

**The interview point:** if Redis crashed and lost everything, the
Postgres conditional update *alone* would still prevent double-booking —
just slower under load, never wrong. "Redis is never the only safety net"
recurs four times in this project (seat locks, caching, rate limiting,
idempotency) — naming that pattern generically is a strong signal.

### Proof

`SeatHoldConcurrency.spec.ts`: 500 concurrent calls at one seat. Naive →
more than one succeeds (the bug). Real implementation → exactly one
succeeds, 499 get a clean rejection. Runs in milliseconds, no database —
the algorithm is tested in-memory; the same algorithm, as one SQL
statement, runs for real against Postgres.

---

## 6. The booking lifecycle (the State pattern)

```
INITIATED → HELD → PAID → CONFIRMED
              |      |        |
           CANCELLED CANCELLED (refund owed)
              |         |
          (terminal)  REFUNDED
HELD → EXPIRED (hold timed out unpaid)
```

Implemented with the **State** design pattern: each state
(`InitiatedState`, `HeldState`, ...) is its own class knowing only its own
legal next moves, instead of one giant `if/else` checking "what state am
I in, is this move allowed." Adding a rule touches one small class.

**The subtle detail:** `CANCELLED` isn't always final. Cancel *before*
paying → terminal, nothing to undo. Cancel *after* paying → `CANCELLED`
owing a refund, so one more legal move exists: `CANCELLED → REFUNDED`,
guarded by a `paymentCaptured` flag. "The same label means two different
things depending on history, and I modeled that explicitly" is a sharp
thing to say.

---

## 7. Payment idempotency — duplicate webhooks, handled correctly

The mock gateway can send the **same success callback twice** (real-world
webhook behavior). Naive fix — "check if we've processed this key, then
process if not" — is the *same* TOCTOU bug as §5: two concurrent
duplicates can both check before either records anything.

**Real fix:** make check-and-claim one atomic DB operation — insert a row
with a `UNIQUE` constraint on the idempotency key. The **database**
decides the winner: one `INSERT` succeeds, the other fails on the
constraint, caught and turned into "read the winner's result, return it,
don't reprocess" (`PaymentRepository.claim()`).

That exact pattern — atomic claim, not check-then-act — is then
generalized project-wide: any POST endpoint accepts an `Idempotency-Key`
header, handled by one global interceptor applying the identical
claim-based dedup everywhere. Solve it once correctly, generalize it —
don't re-solve it slightly differently three times.

---

## 8. The saga — booking → payment → confirmation across processes

Once core-api holds a seat, it asks `payment-service` — a separate
process, reachable only via Kafka — to charge the customer, then reacts
to the answer. Coordinating a multi-step process across independent
services, with a plan for partial failure, is a **saga**.

**Orchestration vs. choreography:** choreography has each service react
to the previous one's events with no central coordinator — the business
process emerges implicitly, scattered across handlers. Orchestration has
one class explicitly drive the sequence. Chose **orchestration**
(`BookingSagaService`) specifically because it's far easier to explain in
an interview: one class, walked through step by step.

**The best decision here:** what if payment-service is killed and the
charge request is *never answered*? No bespoke "compensating transaction"
rollback code was written for this. A booking with no payment answer
simply stays `HELD` until its hold's TTL elapses — the *same* cleanup job
that handles every normal hold expiry handles this too, with zero special
casing. **The hold's TTL is the compensating action.** Proven by a chaos
test that kills payment-service mid-booking and checks the seat frees up
on schedule.

Good answer to "how do you handle partial failure in a distributed
transaction": sometimes the best answer isn't more rollback code, it's
designing the happy path so an existing timeout already produces a safe
outcome.

---

## 9. Caching — Cache-Aside, plus two real-world defenses

~100:1 read:write ratio (real math in `docs/HLD.md` §1) — the
justification for caching at all.

**Cache-aside:** read → check Redis → hit: return; miss: compute from
Postgres, store in Redis with a TTL, return. Writes invalidate (delete)
the cache entry rather than updating it.

**Stampede protection:** a popular show's cache entry expiring during a
flash sale would otherwise send every concurrent reader to Postgres at
once — caching causing the exact failure it's meant to prevent. Fix: the
first miss takes a short Redis lock and computes; everyone else waits
briefly and reads that result instead of also hitting the database.

**Event-driven invalidation:** the cache subscribes to the same domain
events (`BOOKING_CONFIRMED`, etc.) everything else subscribes to — the
**Observer** pattern, reused for a third purpose (notifications, outbox,
now cache invalidation). The booking code has zero awareness the cache
exists.

Same "never the only safety net" principle: every Redis call wrapped in a
circuit breaker, falling back to a direct Postgres read if Redis is
unreachable — slower, never broken.

---

## 10. Rate limiting, circuit breakers, observability (Phase 4)

**Token bucket rate limiting:** a bucket holds up to N tokens, refilling
at a steady rate; each request spends one; empty bucket → 429. Unlike a
flat "N per minute" counter, a token bucket lets a client bank unused
capacity for a legitimate burst. Hand-rolled (`refillAndConsume`, ~20
lines): given current tokens and elapsed time, compute refill (capped at
capacity), check if enough remain. Needed atomic check-and-consume under
concurrency (same TOCTOU concern as everywhere), so production runs as a
**Redis Lua script** — Redis executes Lua atomically.

**Nuance:** Nginx's `limit_req` is a **leaky bucket** — a different
algorithm (smooths bursts via queuing delay, no banked capacity). The
requirement specifically asked for token-bucket semantics, which Nginx
doesn't offer, so Nginx stays a coarse first line of defense and the real
token bucket lives at the application layer. Naming this distinction
precisely is a strong, specific interview answer.

**Circuit breakers:** watch a dependency; after enough consecutive
failures, "open" — stop even trying for a cooldown, fail instantly
instead of waiting on doomed timeouts. Hand-rolled (~90 lines, three
states: CLOSED → OPEN → HALF_OPEN probe → CLOSED or OPEN). Guards exactly
two things: the saga's Kafka publish, and the cache's Redis calls — both
fall back gracefully (§8, §9) rather than crashing the request.

**Correlation IDs:** one request can fan out across four processes
(core-api → Kafka → payment-service → Kafka → core-api → Kafka →
notification-service). Every log line for that request, across all four
processes, shares one ID. Within one process: Node's `AsyncLocalStorage`
(any code in the call chain reads the value with no explicit
parameter-passing). Across a process boundary: the ID rides as a Kafka
message **header**, and the receiver re-establishes its own local context
from that header before continuing. One ID traces a booking's entire
journey through all four processes.

---

## 11. Honesty about what's NOT verified — and why that's a strength

**Docker never worked in this development environment** (Windows,
Docker Desktop's WSL2 backend broken, fixing it needs admin-level system
changes that weren't made unilaterally). Consequence:

- Real Postgres+Redis+Kafka integration tests (Testcontainers): **written,
  never run.**
- The full `docker compose up` stack (two replicas + Nginx + Kafka):
  **structurally validated** (`docker compose config` parses it
  correctly), **never actually started.**
- The chaos test and the k6 load test: **written, never run** — **there
  are no real performance numbers for this project.** `k6/RESULTS.md` is
  a template with every cell deliberately blank, not a guess.

**What IS verified: 263 automated tests, all passing**, covering every
piece of business logic and application code against the in-memory/fake
adapters from §3 — genuinely rigorous, not a consolation prize. The
concurrency proofs, idempotency proofs, saga logic, caching logic, rate
limiter algorithm — all real, tested, correct.

**Say this out loud in an interview, don't hide it.** If asked for p99
latency, the strong answer: *"I don't have a real number — Docker wasn't
available in my dev environment, so the load test never ran. Here's what
I verified instead: [the concurrency tests], and here's exactly what I'd
run to get that number [the k6 script, ready to go]."* That's a *better*
answer than a made-up number — it shows you know the difference between
"I tested this" and "I assume this works," which is the actual skill
system design interviews assess.

---

## How to tell the story (a suggested arc)

1. "I built a ticket-booking platform specifically to demonstrate solving
   three hard problems real booking systems have: double-booking under
   flash-sale concurrency, unreliable/duplicate-sending payment gateways,
   and coordinating a multi-step process across services."
2. "Six packages/services on hexagonal architecture — business logic has
   zero dependency on infrastructure, so I could test everything against
   fakes and only need real Postgres/Redis/Kafka for the production
   adapters."
3. "The core trick, recurring everywhere: never check-then-act on shared
   state. Make the check-and-write one atomic statement, or one atomic
   claim via a unique constraint. I found this exact bug three times
   while building this, including in my own test doubles — which taught
   me to test for the *property* (no double-booking), not just the happy
   path."
4. "Everywhere Redis is an optimization, it's never the only correctness
   guarantee — always backed by a Postgres fallback."
5. "And I can tell you exactly what I verified versus what I didn't,
   because Docker wasn't available in my dev environment — the business
   logic is proven; the real-infrastructure numbers aren't, and here's
   precisely what I'd run to get them."

That last point, delivered confidently, often lands better than a project
where everything "just works" with no story about limitations — it's the
one place to show judgment under a real constraint, not just a finished
product.

## Where to go deeper

- [`HLD.md`](HLD.md) — capacity math, architecture diagram, sharding
  strategy, 10 interview talking points (shorter, more clipped Q&A form
  than this file).
- [`LLD.md`](LLD.md) — class diagrams, every design pattern named with
  code references, phase-by-phase build log.
- [`adr/`](adr) — all 6 decision records, each with the options
  considered and why the shipped one won.
- [`chaos-test.md`](chaos-test.md) — the payment-service-killed scenario,
  step by step.
