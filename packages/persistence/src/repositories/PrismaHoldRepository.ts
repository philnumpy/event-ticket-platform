import { PrismaClient } from '@prisma/client';
import { Hold, HoldRepository, HoldStatus } from '@etp/domain';

interface HoldRecord {
  id: string;
  showId: string;
  seatIds: string[];
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  status: string;
}

export class PrismaHoldRepository implements HoldRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Hold | null> {
    const record = await this.prisma.hold.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findActiveByShow(showId: string): Promise<Hold[]> {
    const records = await this.prisma.hold.findMany({ where: { showId, status: 'ACTIVE' } });
    return records.map((record) => this.toDomain(record));
  }

  async findExpiredActive(now: Date): Promise<Hold[]> {
    const records = await this.prisma.hold.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now } },
    });
    return records.map((record) => this.toDomain(record));
  }

  async save(hold: Hold): Promise<void> {
    await this.prisma.hold.upsert({
      where: { id: hold.id },
      create: {
        id: hold.id,
        showId: hold.showId,
        seatIds: hold.seatIds,
        userId: hold.userId,
        createdAt: hold.createdAt,
        expiresAt: hold.expiresAt,
        status: hold.status,
      },
      update: { status: hold.status },
    });
  }

  private toDomain(record: HoldRecord): Hold {
    // Hold's constructor derives expiresAt from createdAt + ttlSeconds, so
    // we recover ttlSeconds from the two persisted timestamps rather than
    // storing it directly — one less denormalized field to keep in sync.
    const ttlSeconds = Math.round(
      (record.expiresAt.getTime() - record.createdAt.getTime()) / 1000,
    );
    return new Hold({
      id: record.id,
      showId: record.showId,
      seatIds: record.seatIds,
      userId: record.userId,
      createdAt: record.createdAt,
      ttlSeconds,
      status: record.status as HoldStatus,
    });
  }
}
