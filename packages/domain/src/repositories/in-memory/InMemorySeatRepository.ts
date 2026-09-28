import { Seat } from '../../entities/Seat';
import { SeatRepository } from '../SeatRepository';

export class InMemorySeatRepository implements SeatRepository {
  private readonly store = new Map<string, Seat>();

  async findById(id: string): Promise<Seat | null> {
    return this.store.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Seat[]> {
    return ids.map((id) => this.store.get(id)).filter((s): s is Seat => Boolean(s));
  }

  async findByVenue(venueId: string): Promise<Seat[]> {
    return [...this.store.values()].filter((s) => s.venueId === venueId);
  }

  async saveMany(seats: Seat[]): Promise<void> {
    for (const seat of seats) {
      this.store.set(seat.id, seat);
    }
  }
}
