import { Payment } from '../entities/Payment';

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;
  save(payment: Payment): Promise<void>;
}
