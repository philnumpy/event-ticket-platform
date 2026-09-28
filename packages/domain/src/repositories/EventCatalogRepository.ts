import { Event } from '../entities/Event';

export interface EventCatalogRepository {
  findById(id: string): Promise<Event | null>;
  save(event: Event): Promise<void>;
}
