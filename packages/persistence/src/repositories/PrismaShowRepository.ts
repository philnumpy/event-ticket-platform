import { Prisma, PrismaClient } from '@prisma/client';
import { Show, ShowRepository, ShowSearchFilters, ShowStatus } from '@etp/domain';
import { fromPriceMap, toPriceMap } from '../mappers/money';

interface ShowRecord {
  id: string;
  eventId: string;
  venueId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  basePriceByTier: Prisma.JsonValue;
}

export class PrismaShowRepository implements ShowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Show | null> {
    const record = await this.prisma.show.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async search(filters: ShowSearchFilters): Promise<Show[]> {
    const where: Prisma.ShowWhereInput = {};
    if (filters.city) {
      where.venue = { city: filters.city };
    }
    if (filters.genre) {
      where.event = { genre: filters.genre };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.startTime = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      };
    }

    const records = await this.prisma.show.findMany({ where, orderBy: { startTime: 'asc' } });
    return records.map((record) => this.toDomain(record));
  }

  async save(show: Show): Promise<void> {
    const basePriceByTier = fromPriceMap(show.basePriceByTier) as Prisma.InputJsonValue;
    await this.prisma.show.upsert({
      where: { id: show.id },
      create: {
        id: show.id,
        eventId: show.eventId,
        venueId: show.venueId,
        startTime: show.startTime,
        endTime: show.endTime,
        status: show.status,
        basePriceByTier,
      },
      update: {
        startTime: show.startTime,
        endTime: show.endTime,
        status: show.status,
        basePriceByTier,
      },
    });
  }

  private toDomain(record: ShowRecord): Show {
    return new Show({
      id: record.id,
      eventId: record.eventId,
      venueId: record.venueId,
      startTime: record.startTime,
      endTime: record.endTime,
      status: record.status as ShowStatus,
      basePriceByTier: toPriceMap(record.basePriceByTier),
    });
  }
}
