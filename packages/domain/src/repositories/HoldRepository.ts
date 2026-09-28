import { Hold } from '../entities/Hold';

export interface HoldRepository {
  findById(id: string): Promise<Hold | null>;
  findActiveByShow(showId: string): Promise<Hold[]>;
  /** Cross-show scan for the hold-expiry sweep job — holds still ACTIVE
   * whose TTL has already elapsed. */
  findExpiredActive(now: Date): Promise<Hold[]>;
  save(hold: Hold): Promise<void>;
}
