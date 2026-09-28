import { Payment } from '../entities/Payment';

export interface ClaimResult {
  /** true iff this call is the one that should actually process the
   * payment; false means another (possibly concurrent) call already
   * claimed this idempotency key first. */
  created: boolean;
  /** The row now on record for this idempotency key — `attempt` itself when
   * `created` is true, or whatever the original claimant wrote when false. */
  payment: Payment;
}

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;
  /** Used only to persist a status update on a payment this caller already
   * won the claim for (see `claim`). Never used to create a new payment —
   * that would reopen the same check-then-act race idempotency exists to
   * close. */
  save(payment: Payment): Promise<void>;
  /**
   * Atomically create a payment row for `attempt.idempotencyKey`, or
   * discover that one already exists. This is the idempotency guarantee
   * itself: a plain "check findByIdempotencyKey, then save if absent" has
   * the exact same TOCTOU race as naive seat-holding — two concurrent
   * duplicate callbacks (the platform explicitly has to tolerate these)
   * can both observe "not found" before either writes. `claim` closes that
   * race the same way tryTransition does for seats: one atomic
   * insert-or-detect-conflict operation instead of two round trips.
   */
  claim(attempt: Payment): Promise<ClaimResult>;
}
