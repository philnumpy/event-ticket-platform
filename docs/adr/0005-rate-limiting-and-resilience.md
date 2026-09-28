# ADR 0005: Rate limiting, circuit breakers, and API idempotency keys

**Status:** Accepted
**Date:** 2026-09-29

## Context

Three related HLD deliverables land in this phase: rate limiting "at the
gateway" with token-bucket semantics, generic API idempotency keys, and
circuit breaker / timeout / retry-with-backoff failure handling. Building
all three surfaced one architectural fact worth stating up front: **Phase 3
already made payment processing asynchronous via Kafka**, so the
"synchronous core-api → payment-service call" the circuit-breaker
requirement implicitly pictures doesn't exist in this system. The
decisions below are about the calls that *do* exist and *can* actually
fail.

## Rate limiting: token bucket at the app layer, leaky bucket at the gateway — deliberately both

Nginx's `limit_req` directive implements a **leaky bucket**: requests
enter a fixed-size queue and leave at a constant rate, which smooths
bursts by adding latency, not by banking unused capacity. That's a
different algorithm from the **token bucket** the platform committed to
(tokens accumulate during quiet periods and can be spent in a burst) —
Nginx doesn't have a token-bucket directive to reach for.

Rather than settle for "close enough" at the gateway, the actual token
bucket lives at the application layer
(`services/core-api/src/common/rate-limit`), keyed per client IP (via
`trust proxy`, since Nginx is the actual socket peer for every request —
see `main.ts`). Nginx's `limit_req` stays in front of it as a coarse,
cheap first line of defense against obviously-abusive traffic hitting the
gateway at all, not as the source of truth for per-client quotas. Two
layers, two different jobs, not redundant.

The token-bucket algorithm itself (`TokenBucketMath.refillAndConsume`) is
a pure function shared, by design, between `InMemoryTokenBucketRateLimiter`
(tests) and the Lua script `RedisTokenBucketRateLimiter` sends to Redis
(production) — the same "one algorithm, two adapters" shape as every other
port in this codebase. The Lua script exists because a naive
GET-refill-compare-SET sequence from application code has the identical
check-then-act race every other naive read-modify-write in this project
turned out to have; Redis executes a script atomically, so the whole
refill-and-consume operation is one indivisible step. (Redis's Lua-to-RESP
conversion truncates a *returned* Lua number to an integer, which would
silently floor a fractional token count on every call — worked around by
returning `tostring(tokens)` instead of the raw number.)

**Fails open, not closed**: if the rate limiter's Redis backend is
unreachable, `TokenBucketGuard` logs the error and allows the request
rather than rejecting all traffic. Losing rate-limiting protection for the
duration of an outage is a smaller problem than losing availability
entirely over a dependency whose only job was shedding excess load.

## Circuit breakers: guarding the two calls that can actually hang

Reinterpreted for the architecture Phase 3 built, not the one originally
sketched:

- **`BookingSagaService`'s Kafka publish** (`payment.requested`): a few
  quick retries with backoff, inside a circuit breaker. On exhausted
  retries or an open circuit, the failure is logged and **swallowed, not
  rethrown** — this handler runs synchronously inside `initiateBooking`'s
  `SEATS_HELD` publish, so propagating it would fail a booking request
  that had already durably succeeded, over a downstream dependency the
  client had no way to know about. The booking degrades to exactly the
  outcome of an answered-but-never-responded-to payment request:
  `HoldExpirySweep` compensates once the hold's TTL elapses (ADR 0004).
- **`CatalogCacheService`'s Redis calls**: every one wrapped the same way,
  falling back to computing directly against Postgres. Caching exists to
  reduce database load, not to become a second dependency that has to be
  up for reads to work.

The `CircuitBreaker` class itself is hand-rolled (~90 lines) rather than a
dependency like `opossum` or `cockatiel` — demonstrating the state machine
is the point of a portfolio project; consuming someone else's isn't. Retry
and circuit-breaking are deliberately composed, not merged into one
mechanism: retry absorbs a single transient blip by trying again almost
immediately; a circuit breaker responds to *sustained* failure by refusing
to keep trying at all. Nesting retry inside the breaker's `execute()`
means a brief hiccup recovers on its own without ever tripping the
breaker, while a genuinely down dependency still opens it instead of every
caller separately retrying against it forever.

## API idempotency keys: the same atomic-claim shape, applied generically

`IdempotencyInterceptor` reads an opt-in `Idempotency-Key` header
(Stripe's convention) and applies to every POST route via a global
`APP_INTERCEPTOR`, rather than being bolted onto individual controllers.
It reuses the exact claim pattern `PaymentRepository.claim()` established
in ADR 0003: atomically claim the key (`SET NX`), execute the handler only
if the claim was won, cache the result, and have every other caller with
the same key either replay that cached result or (bounded wait, same
trade-off as `awaitSettledPayment`) fall through to processing normally if
it doesn't arrive in time.

Only the response **body** is cached and replayed — not the HTTP status
code. Nest determines a route's status from its own decorator metadata
(`@HttpCode`, or the per-verb default) independently of whether an
interceptor short-circuits the actual handler, so a replayed value still
receives the correct status automatically. Capturing and reapplying
`res.statusCode` inside the interceptor would be redundant at best, and
unreliable at worst — Nest's response pipeline sets the final status
*after* interceptors run, not before.

## Consequences

- Every new resilience mechanism in this phase follows the same shape as
  the ones before it: an atomic claim/compare-and-set where correctness
  requires one (rate limiter, idempotency key), graceful degradation to a
  safe fallback where availability matters more than strict enforcement
  (cache, rate limiter, saga's Kafka publish).
- `docker-compose.yml` now runs two `core-api` replicas behind Nginx,
  proving the "stateless, horizontally scalable" claim structurally rather
  than asserting it — the service holds no in-process state that would
  make replica choice matter.
- Verification status matches every other infrastructure-dependent piece
  in this project: the algorithms and application-layer logic are directly
  unit-tested (`TokenBucketMath`, `InMemoryTokenBucketRateLimiter`,
  `CircuitBreaker`, `IdempotencyInterceptor` via e2e tests against
  in-memory adapters); the Lua script's actual execution inside Redis, and
  the two-replicas-behind-Nginx topology, are unverified pending Docker
  (see the README's "Known gaps" section).
