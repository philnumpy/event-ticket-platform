import { ShowSeat, ShowSeatStatus } from '../entities/ShowSeat';

export interface TryTransitionParams {
  showId: string;
  seatId: string;
  from: ShowSeatStatus;
  to: ShowSeatStatus;
  /** The hold this transition is performed on behalf of. Required for
   * ownership checks on every transition except AVAILABLE -> HELD, where
   * there is by definition no prior owner to check against. */
  holdId: string;
}

export interface ShowSeatRepository {
  findById(showId: string, seatId: string): Promise<ShowSeat | null>;
  findByShow(showId: string): Promise<ShowSeat[]>;
  findByShowAndSeats(showId: string, seatIds: string[]): Promise<ShowSeat[]>;
  /** For initial seeding only (e.g. provisioning inventory when a show is
   * created). Never used to mutate a seat's lifecycle state, because a
   * read-mutate-write round trip through save() is exactly the
   * check-then-act race that double-books a seat under concurrency. */
  save(showSeat: ShowSeat): Promise<void>;
  saveMany(showSeats: ShowSeat[]): Promise<void>;
  /**
   * Atomically transition one seat's status iff it currently equals `from`
   * (and, other than for the AVAILABLE -> HELD acquisition, iff it is
   * currently owned by `holdId`). Returns whether the transition actually
   * happened — `false` means someone else already moved this seat on
   * (someone else won the hold race, or a hold-expiry sweep already
   * released it before a late payment confirmation arrived). This is the
   * only safe way to mutate a seat's lifecycle state under concurrency; see
   * docs/adr for why a plain conditional UPDATE is preferred here over an
   * explicit SELECT ... FOR UPDATE transaction.
   */
  tryTransition(params: TryTransitionParams): Promise<boolean>;
}
