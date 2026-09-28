import { PrismaClient } from '@prisma/client';
import { Seat, SeatRepository, SeatTier } from '@etp/domain';

interface SeatRecord {
  id: string;
  venueId: string;
  section: string;
  row: string;
  seatNumber: number;
  tier: string;
}

export class PrismaSeatRepository implements SeatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Seat | null> {
    const record = await this.prisma.seat.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByIds(ids: string[]): Promise<Seat[]> {
    if (ids.length === 0) return [];
    const records = await this.prisma.seat.findMany({ where: { id: { in: ids } } });
    return records.map((record) => this.toDomain(record));
  }

  async findByVenue(venueId: string): Promise<Seat[]> {
    const records = await this.prisma.seat.findMany({ where: { venueId } });
    return records.map((record) => this.toDomain(record));
  }

  async saveMany(seats: Seat[]): Promise<void> {
    await this.prisma.$transaction(
      seats.map((seat) =>
        this.prisma.seat.upsert({
          where: { id: seat.id },
          create: {
            id: seat.id,
            venueId: seat.venueId,
            section: seat.section,
            row: seat.row,
            seatNumber: seat.seatNumber,
            tier: seat.tier,
          },
          update: {
            section: seat.section,
            row: seat.row,
            seatNumber: seat.seatNumber,
            tier: seat.tier,
          },
        }),
      ),
    );
  }

  private toDomain(record: SeatRecord): Seat {
    return new Seat({
      id: record.id,
      venueId: record.venueId,
      section: record.section,
      row: record.row,
      seatNumber: record.seatNumber,
      tier: record.tier as SeatTier,
    });
  }
}
