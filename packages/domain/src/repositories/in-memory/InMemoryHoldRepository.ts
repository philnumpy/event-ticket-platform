import { Hold } from '../../entities/Hold';
import { HoldRepository } from '../HoldRepository';

export class InMemoryHoldRepository implements HoldRepository {
  private readonly store = new Map<string, Hold>();

  async findById(id: string): Promise<Hold | null> {
    return this.store.get(id) ?? null;
  }

  async findActiveByShow(showId: string): Promise<Hold[]> {
    return [...this.store.values()].filter((h) => h.showId === showId && h.status === 'ACTIVE');
  }

  async save(hold: Hold): Promise<void> {
    this.store.set(hold.id, hold);
  }
}
