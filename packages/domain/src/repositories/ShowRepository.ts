import { Show } from '../entities/Show';

export interface ShowSearchFilters {
  city?: string;
  genre?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ShowRepository {
  findById(id: string): Promise<Show | null>;
  /** Filtering by genre requires joining against Event, so implementations
   * take the venue-city and event-genre lookups they need as constructor
   * dependencies rather than this interface leaking cross-aggregate joins. */
  search(filters: ShowSearchFilters): Promise<Show[]>;
  save(show: Show): Promise<void>;
}
