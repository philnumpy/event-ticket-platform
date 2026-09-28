import { Hold } from '../entities/Hold';

export interface HoldRepository {
  findById(id: string): Promise<Hold | null>;
  findActiveByShow(showId: string): Promise<Hold[]>;
  save(hold: Hold): Promise<void>;
}
