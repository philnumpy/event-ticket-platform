import { Prisma, PrismaClient } from '@prisma/client';
import { ClaimResult, Money, Payment, PaymentRepository, PaymentStatus } from '@etp/domain';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

interface PaymentRecord {
  id: string;
  bookingId: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  provider: string;
  status: string;
  createdAt: Date;
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const record = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
    return record ? this.toDomain(record) : null;
  }

  async save(payment: Payment): Promise<void> {
    await this.prisma.payment.upsert({
      where: { id: payment.id },
      create: {
        id: payment.id,
        bookingId: payment.bookingId,
        amountMinorUnits: payment.amount.amount,
        currency: payment.amount.currencyCode,
        idempotencyKey: payment.idempotencyKey,
        provider: payment.provider,
        status: payment.status,
        createdAt: payment.createdAt,
      },
      update: { status: payment.status },
    });
  }

  /**
   * The idempotency guarantee itself. A plain INSERT with a UNIQUE
   * constraint on idempotencyKey means Postgres — not application code —
   * decides who wins when two duplicate callbacks race: exactly one
   * `create` succeeds, the other fails with a P2002 conflict, which we
   * translate into "someone already claimed this, go read their row."
   * This is the payments analogue of PrismaShowSeatRepository's conditional
   * UPDATE: one atomic statement instead of a check-then-insert pair.
   */
  async claim(attempt: Payment): Promise<ClaimResult> {
    try {
      const record = await this.prisma.payment.create({
        data: {
          id: attempt.id,
          bookingId: attempt.bookingId,
          amountMinorUnits: attempt.amount.amount,
          currency: attempt.amount.currencyCode,
          idempotencyKey: attempt.idempotencyKey,
          provider: attempt.provider,
          status: attempt.status,
          createdAt: attempt.createdAt,
        },
      });
      return { created: true, payment: this.toDomain(record) };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        const existing = await this.findByIdempotencyKey(attempt.idempotencyKey);
        if (existing) {
          return { created: false, payment: existing };
        }
      }
      throw err;
    }
  }

  private toDomain(record: PaymentRecord): Payment {
    return new Payment({
      id: record.id,
      bookingId: record.bookingId,
      amount: Money.of(record.amountMinorUnits, record.currency),
      idempotencyKey: record.idempotencyKey,
      provider: record.provider,
      createdAt: record.createdAt,
      status: record.status as PaymentStatus,
    });
  }
}
