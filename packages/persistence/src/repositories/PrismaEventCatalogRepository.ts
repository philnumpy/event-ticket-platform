import { PrismaClient } from '@prisma/client';
import { Event, EventCatalogRepository } from '@etp/domain';

export class PrismaEventCatalogRepository implements EventCatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Event | null> {
    const record = await this.prisma.event.findUnique({ where: { id } });
    if (!record) return null;
    return new Event({
      id: record.id,
      title: record.title,
      genre: record.genre,
      description: record.description ?? undefined,
      durationMinutes: record.durationMinutes,
    });
  }

  async save(event: Event): Promise<void> {
    await this.prisma.event.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        title: event.title,
        genre: event.genre,
        description: event.description ?? null,
        durationMinutes: event.durationMinutes,
      },
      update: {
        title: event.title,
        genre: event.genre,
        description: event.description ?? null,
        durationMinutes: event.durationMinutes,
      },
    });
  }
}
