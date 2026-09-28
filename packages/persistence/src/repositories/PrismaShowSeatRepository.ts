import { Prisma, PrismaClient } from '@prisma/client';
import { ShowSeat, ShowSeatRepository, ShowSeatStatus, TryTransitionParams } from '@etp/domain';

interface ShowSeatRecord {
  showId: string;
  seatId: string;
  status: string;
  holdId: string | null;
}

export class PrismaShowSeatRepository implements ShowSeatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(showId: string, seatId: string): Promise<ShowSeat | null> {
    const record = await this.prisma.showSeat.findUnique({
      where: { showId_seatId: { showId, seatId } },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByShow(showId: string): Promise<ShowSeat[]> {
    const records = await this.prisma.showSeat.findMany({ where: { showId } });
    return records.map((record) => this.toDomain(record));
  }

  async findByShowAndSeats(showId: string, seatIds: string[]): Promise<ShowSeat[]> {
    if (seatIds.length === 0) return [];
    const records = await this.prisma.showSeat.findMany({
      where: { showId, seatId: { in: seatIds } },
    });
    return records.map((record) => this.toDomain(record));
  }

  /** Seeding only — see the interface doc on ShowSeatRepository.save(). */
  async save(showSeat: ShowSeat): Promise<void> {
    await this.prisma.showSeat.upsert({
      where: { showId_seatId: { showId: showSeat.showId, seatId: showSeat.seatId } },
      create: {
        showId: showSeat.showId,
        seatId: showSeat.seatId,
        status: showSeat.status,
        holdId: showSeat.holdId,
      },
      update: {
        status: showSeat.status,
        holdId: showSeat.holdId,
      },
    });
  }

  async saveMany(showSeats: ShowSeat[]): Promise<void> {
    await this.prisma.$transaction(showSeats.map((seat) => this.upsertStatement(seat)));
  }

  private upsertStatement(showSeat: ShowSeat) {
    return this.prisma.showSeat.upsert({
      where: { showId_seatId: { showId: showSeat.showId, seatId: showSeat.seatId } },
      create: {
        showId: showSeat.showId,
        seatId: showSeat.seatId,
        status: showSeat.status,
        holdId: showSeat.holdId,
      },
      update: {
        status: showSeat.status,
        holdId: showSeat.holdId,
      },
    });
  }

  /**
   * The correctness-critical operation. A single atomic UPDATE ... WHERE,
   * not a SELECT-then-UPDATE pair: Postgres evaluates the WHERE clause and
   * applies the SET in one row-locked step, so two concurrent callers
   * racing the same seat can never both see the row as eligible. Only one
   * UPDATE's WHERE clause matches; the loser affects zero rows.
   *
   * Deliberately NOT wrapped in an explicit `SELECT ... FOR UPDATE`
   * transaction: that pattern needs two round trips (SELECT, then UPDATE)
   * across which the row lock is held, which is strictly more lock-hold
   * time under contention for no extra safety here — the single-statement
   * UPDATE already gets Postgres's implicit per-statement atomicity. See
   * docs/adr/0002-seat-hold-concurrency-control.md.
   */
  async tryTransition(params: TryTransitionParams): Promise<boolean> {
    const { showId, seatId, from, to, holdId } = params;
    const newHoldId = to === 'AVAILABLE' ? null : holdId;

    const ownerClause =
      from === 'AVAILABLE' ? Prisma.empty : Prisma.sql`AND "holdId" = ${holdId}`;

    const affectedRows = await this.prisma.$executeRaw`
      UPDATE show_seats
      SET status = ${to}::"ShowSeatStatus", "holdId" = ${newHoldId}
      WHERE "showId" = ${showId}
        AND "seatId" = ${seatId}
        AND status = ${from}::"ShowSeatStatus"
        ${ownerClause}
    `;

    return affectedRows === 1;
  }

  private toDomain(record: ShowSeatRecord): ShowSeat {
    return new ShowSeat({
      showId: record.showId,
      seatId: record.seatId,
      status: record.status as ShowSeatStatus,
      holdId: record.holdId,
    });
  }
}
