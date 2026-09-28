import { ShowSeat } from '../../entities/ShowSeat';
import { ShowSeatRepository } from '../ShowSeatRepository';

export class InMemoryShowSeatRepository implements ShowSeatRepository {
  private readonly store = new Map<string, ShowSeat>();

  private key(showId: string, seatId: string): string {
    return `${showId}:${seatId}`;
  }

  async findById(showId: string, seatId: string): Promise<ShowSeat | null> {
    const found = this.store.get(this.key(showId, seatId));
    return found ? found.clone() : null;
  }

  async findByShow(showId: string): Promise<ShowSeat[]> {
    return [...this.store.values()].filter((s) => s.showId === showId).map((s) => s.clone());
  }

  async findByShowAndSeats(showId: string, seatIds: string[]): Promise<ShowSeat[]> {
    return seatIds
      .map((seatId) => this.store.get(this.key(showId, seatId)))
      .filter((s): s is ShowSeat => Boolean(s))
      .map((s) => s.clone());
  }

  async save(showSeat: ShowSeat): Promise<void> {
    this.store.set(this.key(showSeat.showId, showSeat.seatId), showSeat);
  }

  async saveMany(showSeats: ShowSeat[]): Promise<void> {
    for (const showSeat of showSeats) {
      await this.save(showSeat);
    }
  }
}
