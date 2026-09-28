import { ShowSeat } from '../entities/ShowSeat';

export interface ShowSeatRepository {
  findById(showId: string, seatId: string): Promise<ShowSeat | null>;
  findByShow(showId: string): Promise<ShowSeat[]>;
  findByShowAndSeats(showId: string, seatIds: string[]): Promise<ShowSeat[]>;
  save(showSeat: ShowSeat): Promise<void>;
  saveMany(showSeats: ShowSeat[]): Promise<void>;
}
