import { Payment } from '../../entities/Payment';
import { ClaimResult, PaymentRepository } from '../PaymentRepository';

export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly store = new Map<string, Payment>();
  private readonly byIdempotencyKey = new Map<string, string>();

  async findById(id: string): Promise<Payment | null> {
    return this.store.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const id = this.byIdempotencyKey.get(key);
    return id ? this.store.get(id) ?? null : null;
  }

  async save(payment: Payment): Promise<void> {
    this.store.set(payment.id, payment);
    this.byIdempotencyKey.set(payment.idempotencyKey, payment.id);
  }

  /** No `await` before the check-and-set, so this is atomic for the same
   * reason InMemoryShowSeatRepository.tryTransition is. */
  async claim(attempt: Payment): Promise<ClaimResult> {
    const existingId = this.byIdempotencyKey.get(attempt.idempotencyKey);
    if (existingId) {
      const existing = this.store.get(existingId);
      if (existing) {
        return { created: false, payment: existing };
      }
    }
    this.store.set(attempt.id, attempt);
    this.byIdempotencyKey.set(attempt.idempotencyKey, attempt.id);
    return { created: true, payment: attempt };
  }
}
