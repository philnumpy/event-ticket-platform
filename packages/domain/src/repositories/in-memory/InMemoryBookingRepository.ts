import { Booking } from '../../entities/Booking';
import { BookingRepository } from '../BookingRepository';

export class InMemoryBookingRepository implements BookingRepository {
  private readonly store = new Map<string, Booking>();

  async findById(id: string): Promise<Booking | null> {
    return this.store.get(id) ?? null;
  }

  async findByHoldId(holdId: string): Promise<Booking | null> {
    return [...this.store.values()].find((b) => b.holdId === holdId) ?? null;
  }

  async findByUser(userId: string): Promise<Booking[]> {
    return [...this.store.values()].filter((b) => b.userId === userId);
  }

  async countRecentByUserAndShow(
    userId: string,
    showId: string,
    windowMinutes: number,
  ): Promise<number> {
    const cutoff = Date.now() - windowMinutes * 60_000;
    return [...this.store.values()].filter(
      (b) => b.userId === userId && b.showId === showId && b.createdAt.getTime() >= cutoff,
    ).length;
  }

  async save(booking: Booking): Promise<void> {
    this.store.set(booking.id, booking);
  }
}
