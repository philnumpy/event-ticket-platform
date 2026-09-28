import { PrismaClient } from '@prisma/client';
import { Venue, VenueRepository } from '@etp/domain';

export class PrismaVenueRepository implements VenueRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Venue | null> {
    const record = await this.prisma.venue.findUnique({ where: { id } });
    return record ? new Venue(record) : null;
  }

  async save(venue: Venue): Promise<void> {
    await this.prisma.venue.upsert({
      where: { id: venue.id },
      create: { id: venue.id, name: venue.name, city: venue.city, address: venue.address },
      update: { name: venue.name, city: venue.city, address: venue.address },
    });
  }
}
