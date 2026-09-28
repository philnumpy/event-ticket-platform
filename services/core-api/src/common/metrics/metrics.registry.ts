import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * One shared registry for the whole process, module-level singleton rather
 * than a Nest provider: metric objects are inherently process-global state
 * (Prometheus scrapes the whole process, not a per-request instance), so
 * there's nothing DI would add here except indirection.
 */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry }); // event loop lag, memory, GC, etc.

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.2, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const rateLimitRejectionsTotal = new Counter({
  name: 'rate_limit_rejections_total',
  help: 'Requests rejected by TokenBucketGuard with 429',
  registers: [metricsRegistry],
});

export const circuitBreakerTransitionsTotal = new Counter({
  name: 'circuit_breaker_transitions_total',
  help: 'Circuit breaker state transitions, by breaker name and resulting state',
  labelNames: ['breaker', 'state'],
  registers: [metricsRegistry],
});
