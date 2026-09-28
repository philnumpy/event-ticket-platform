import { PrismaClient } from '@prisma/client';
import { Booking, BookingRepository, BookingState, Money } from '@etp/domain';

interface BookingRecord {
  id: string;
  userId: string;
  showId: string;
  seatIds: string[];
  amountMinorUnits: number;
  currency: string;
  state: string;
  paymentCaptured: boolean;
  holdId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Booking | null> {
    const record = await this.prisma.booking.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByHoldId(holdId: string): Promise<Booking | null> {
    const record = await this.prisma.booking.findFirst({ where: { holdId } });
    return record ? this.toDomain(record) : null;
  }

  async findByUser(userId: string): Promise<Booking[]> {
    const records = await this.prisma.booking.findMany({ where: { userId } });
    return records.map((record) => this.toDomain(record));
  }

  async countRecentByUserAndShow(
    userId: string,
    showId: string,
    windowMinutes: number,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - windowMinutes * 60_000);
    return this.prisma.booking.count({
      where: { userId, showId, createdAt: { gte: cutoff } },
    });
  }

  async save(booking: Booking): Promise<void> {
    await this.prisma.booking.upsert({
      where: { id: booking.id },
      create: {
        id: booking.id,
        userId: booking.userId,
        showId: booking.showId,
        seatIds: booking.seatIds,
        amountMinorUnits: booking.amount.amount,
        currency: booking.amount.currencyCode,
        state: booking.state,
        paymentCaptured: booking.paymentCaptured,
        holdId: booking.holdId,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      },
      update: {
        state: booking.state,
        paymentCaptured: booking.paymentCaptured,
        holdId: booking.holdId,
        updatedAt: booking.updatedAt,
      },
    });
  }

  private toDomain(record: BookingRecord): Booking {
    return new Booking({
      id: record.id,
      userId: record.userId,
      showId: record.showId,
      seatIds: record.seatIds,
      amount: Money.of(record.amountMinorUnits, record.currency),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      state: record.state as BookingState,
      paymentCaptured: record.paymentCaptured,
      holdId: record.holdId,
    });
  }
}
