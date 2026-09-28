import { Payment } from '../../entities/Payment';
import { PaymentRepository } from '../PaymentRepository';

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
}
