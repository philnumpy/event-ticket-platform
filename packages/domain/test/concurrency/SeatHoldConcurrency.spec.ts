import { randomUUID } from 'node:crypto';
import { InMemoryShowSeatRepository } from '../../src/repositories/in-memory/InMemoryShowSeatRepository';
import { NaiveInMemorySeatHoldService } from '../../src/services/NaiveInMemorySeatHoldService';
import { GuardedInMemorySeatHoldService } from '../../src/services/GuardedInMemorySeatHoldService';
import { ShowSeat } from '../../src/entities/ShowSeat';
import { SeatNotAvailableError } from '../../src/errors/DomainErrors';
import { SeatHoldService } from '../../src/services/SeatHoldService';

const SHOW_ID = 'flash-sale-show';
const SEAT_ID = 'seat-A1';
const CONCURRENT_CALLERS = 500;

async function raceForOneSeat(
  service: SeatHoldService,
): Promise<{ succeeded: number; failed: number; errors: unknown[] }> {
  const attempts = Array.from({ length: CONCURRENT_CALLERS }, () =>
    service.hold(SHOW_ID, SEAT_ID, randomUUID()),
  );

  const results = await Promise.allSettled(attempts);
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter((r) => r.status === 'rejected');

  return {
    succeeded,
    failed: rejected.length,
    errors: rejected.map((r) => (r as PromiseRejectedResult).reason),
  };
}

describe('Seat-hold concurrency: 500 callers racing for the same single seat', () => {
  it('DOUBLE-BOOKS the seat with the naive check-then-act implementation', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: SHOW_ID, seatId: SEAT_ID }));
    const naive = new NaiveInMemorySeatHoldService(repo, 1);

    const { succeeded } = await raceForOneSeat(naive);

    // A correct implementation could only ever let exactly one caller win a
    // single physical seat. Seeing more than one success here is the bug,
    // not a fluke — it's the whole point of this test.
    expect(succeeded).toBeGreaterThan(1);
  }, 15_000);

  it('lets exactly ONE caller win with the mutex-guarded implementation', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: SHOW_ID, seatId: SEAT_ID }));
    const guarded = new GuardedInMemorySeatHoldService(repo, 1);

    const { succeeded, failed, errors } = await raceForOneSeat(guarded);

    expect(succeeded).toBe(1);
    expect(failed).toBe(CONCURRENT_CALLERS - 1);
    expect(errors.every((e) => e instanceof SeatNotAvailableError)).toBe(true);

    const finalState = await repo.findById(SHOW_ID, SEAT_ID);
    expect(finalState?.status).toBe('HELD');
  }, 15_000);
});
