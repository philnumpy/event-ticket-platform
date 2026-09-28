import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  correlationId: string;
}

/**
 * Node's AsyncLocalStorage carries the correlation ID through an async call
 * chain (route handler -> application service -> repository ->
 * DomainEventPublisher subscribers) without threading an extra parameter
 * through every function signature along the way. CorrelationIdMiddleware
 * is the only place that calls `.run()`; everything else just reads.
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
