import { ShowSeat } from '../../entities/ShowSeat';
import { ShowSeatRepository, TryTransitionParams } from '../ShowSeatRepository';

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

  /** No `await` occurs between the check and the write below, so this is
   * atomic for the same reason a single Postgres UPDATE statement is: there
   * is no window for another caller to interleave. This is what makes it a
   * faithful in-memory stand-in for PrismaShowSeatRepository's raw
   * conditional UPDATE in Phase 2's persistence package. */
  async tryTransition(params: TryTransitionParams): Promise<boolean> {
    const key = this.key(params.showId, params.seatId);
    const current = this.store.get(key);
    if (!current || current.status !== params.from) {
      return false;
    }
    if (params.from !== 'AVAILABLE' && current.holdId !== params.holdId) {
      return false;
    }

    this.store.set(
      key,
      new ShowSeat({
        showId: params.showId,
        seatId: params.seatId,
        status: params.to,
        holdId: params.to === 'AVAILABLE' ? null : params.holdId,
      }),
    );
    return true;
  }
}
