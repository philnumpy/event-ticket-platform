import { Event } from '../../entities/Event';
import { EventCatalogRepository } from '../EventCatalogRepository';

export class InMemoryEventCatalogRepository implements EventCatalogRepository {
  private readonly store = new Map<string, Event>();

  async findById(id: string): Promise<Event | null> {
    return this.store.get(id) ?? null;
  }

  async save(event: Event): Promise<void> {
    this.store.set(event.id, event);
  }
}
