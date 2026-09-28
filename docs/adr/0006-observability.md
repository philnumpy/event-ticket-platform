# ADR 0006: Structured logs, correlation IDs, and metrics

**Status:** Accepted
**Date:** 2026-09-29

## Context

A request to `core-api` can fan out across process boundaries: a booking
triggers a Kafka command to `payment-service`, whose response triggers a
saga callback back in `core-api`, which triggers an outbox-relayed event to
`notification-service`. Debugging any of that from four processes' worth
of unrelated log lines, with no way to tell which lines belong to the same
request, isn't tractable at the scale this platform is designed around.

## Structured logs

`core-api` replaces Nest's default console logger with `AppLogger`
(`app.useLogger(new AppLogger())` in `main.ts`), which emits JSON via
`pino` instead of formatted strings — `service`, `level`, `context` (Nest's
own per-class logger label), and `correlationId` on every line, machine-
parseable by any log aggregator rather than needing to be pattern-matched.
`payment-service` and `notification-service` use `pino` directly (no Nest
dependency to route through).

## Correlation IDs, end to end

`CorrelationIdMiddleware` is the single entry point: reuse the caller's
`X-Correlation-Id` header if supplied, otherwise mint one, echo it in the
response header, and wrap the rest of the request in Node's
`AsyncLocalStorage` (`correlationStorage`) so every log line — and every
event that request causes — can read it without a value being threaded
through every function signature along the way.

That context has to be deliberately re-entered at each process boundary,
since `AsyncLocalStorage` doesn't cross the network:

- **HTTP → outbox → Kafka**: `OutboxEventPublisher` takes a
  `getCorrelationId` callback (kept as a plain function parameter, not a
  direct dependency on `core-api`'s `AsyncLocalStorage` — `@etp/messaging`
  has no business knowing HTTP requests exist) and stamps it onto the
  outbox row it writes. `KafkaEventPublisher` carries it forward as a
  Kafka message header when the relay eventually publishes.
- **HTTP → saga → payment-service**: `BookingSagaService` reads
  `getCorrelationId()` when it reacts to `SEATS_HELD` (still inside the
  original request's async chain, since `DomainEventPublisher.publish`
  awaits every subscriber) and passes it to
  `PaymentCommandPublisher.publishPaymentRequested`, which sends it as a
  header on `payment.requested`.
- **payment-service → saga**: reads `message.headers.correlationId` off
  the consumed `payment.requested` message, includes it in its own pino
  log line, and passes it back through `KafkaResponsePublisher` as a
  header on `payment.gateway.responded`.
- **saga → confirmPayment**: `handleGatewayResponse` re-enters
  `correlationStorage.run(...)` with the ID read from that response
  message's headers before calling `confirmPayment`, so log lines from
  *inside* that call — now running in a Kafka consumer callback, not an
  HTTP request — still carry the same trace.
- **outbox → notification-service**: reads `message.headers.correlationId`
  the same way, one hop further down the chain.

The result: one ID, generated once at the edge, recoverable from any log
line across four processes for a single booking's entire lifecycle,
without a tracing backend (Jaeger/Zipkin) — a deliberate scope decision
for this project's size; the "at 100x scale" answer is OpenTelemetry spans
carrying the same ID as a trace attribute, not a replacement for the ID
itself.

## Metrics

A single `prom-client` `Registry` (`metrics.registry.ts`) exposed at
`GET /metrics` in Prometheus text format, alongside Node's own default
process metrics (event loop lag, memory, GC). Three custom metrics, each
tied to a decision this project already makes:

- `http_request_duration_seconds` / `http_requests_total` — via a global
  `MetricsInterceptor`, labeled by method/route/status.
- `rate_limit_rejections_total` — incremented in `TokenBucketGuard` every
  time a request is actually rejected (not on every check).
- `circuit_breaker_transitions_total` — `CircuitBreaker` takes an optional
  `onStateChange` callback (called only when the state actually changes,
  not on every successful call), which both breaker instances
  (`payment-command-publisher`, `catalog-redis`) wire to this counter.
  Kept as a callback rather than an import inside `CircuitBreaker` itself,
  for the same reason `OutboxEventPublisher` takes a correlation-ID
  callback: the mechanism shouldn't have to know which metrics backend, if
  any, is watching it.

`prom-client` itself is a standard client library, not hand-rolled —
unlike `CircuitBreaker` and the token-bucket rate limiter, there's no
interesting algorithm here to demonstrate; it's just a Prometheus text-
format exporter.

## Consequences

- Every propagation hop is directly tested without needing a real Kafka
  broker: `correlation-id.e2e.spec.ts` proves the HTTP → outbox and
  HTTP → saga hops against in-memory adapters; `paymentRequestHandler
  .spec.ts` proves payment-service's read-and-forward step against a
  recording fake. The two remaining hops (payment-service →
  Kafka header → saga's re-entry, and outbox → Kafka header →
  notification-service) rely on `KafkaConsumerRunner`'s already-tested
  generic header decoding, so they're covered by construction rather than
  independently, which is a real (small) gap in the test pyramid worth
  naming rather than glossing over.
- `metrics.e2e.spec.ts` proves `/metrics` actually reflects real request
  traffic against the in-memory test app; Grafana dashboards or alerting
  rules built on top of these metrics are out of this project's scope.
