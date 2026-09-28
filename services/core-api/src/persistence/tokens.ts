/**
 * TypeScript interfaces vanish at runtime, so NestJS DI needs a concrete
 * token per port to bind an interface to an implementation. These stay in
 * one file so `persistence.module.ts` (the only place that binds them) and
 * every consumer stay in sync.
 */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export const VENUE_REPOSITORY = Symbol('VENUE_REPOSITORY');
export const SEAT_REPOSITORY = Symbol('SEAT_REPOSITORY');
export const EVENT_CATALOG_REPOSITORY = Symbol('EVENT_CATALOG_REPOSITORY');
export const SHOW_REPOSITORY = Symbol('SHOW_REPOSITORY');
export const SHOW_SEAT_REPOSITORY = Symbol('SHOW_SEAT_REPOSITORY');
export const HOLD_REPOSITORY = Symbol('HOLD_REPOSITORY');
export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');
export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

export const SEAT_HOLD_SERVICE = Symbol('SEAT_HOLD_SERVICE');
export const PRICING_STRATEGY = Symbol('PRICING_STRATEGY');
export const REFUND_POLICY_SELECTOR = Symbol('REFUND_POLICY_SELECTOR');
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');
export const HOLD_EXPIRY_SWEEP = Symbol('HOLD_EXPIRY_SWEEP');
