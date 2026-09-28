import { InMemoryShowSeatRepository } from '../../src/repositories/in-memory/InMemoryShowSeatRepository';
import { NaiveInMemorySeatHoldService } from '../../src/services/NaiveInMemorySeatHoldService';
import { GuardedInMemorySeatHoldService } from '../../src/services/GuardedInMemorySeatHoldService';
import { ShowSeat } from '../../src/entities/ShowSeat';
import { NotFoundError, SeatNotAvailableError } from '../../src/errors/DomainErrors';
import { ShowSeatRepository } from '../../src/repositories/ShowSeatRepository';
import { SeatHoldService } from '../../src/services/SeatHoldService';

type Ctor = new (repo: ShowSeatRepository, delayMs: number) => SeatHoldService;

describe.each<[string, Ctor]>([
  ['NaiveInMemorySeatHoldService', NaiveInMemorySeatHoldService],
  ['GuardedInMemorySeatHoldService', GuardedInMemorySeatHoldService],
])('%s (sequential, non-racing behavior)', (_name, ServiceClass) => {
  it('throws NotFoundError when the show seat has no inventory row', async () => {
    const repo = new InMemoryShowSeatRepository();
    const service = new ServiceClass(repo, 1);

    await expect(service.hold('show-1', 'seat-missing', 'hold-1')).rejects.toThrow(NotFoundError);
  });

  it('succeeds once, then rejects a second sequential attempt on the same seat', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: 'show-1', seatId: 'seat-1' }));
    const service = new ServiceClass(repo, 1);

    await expect(service.hold('show-1', 'seat-1', 'hold-1')).resolves.toBeUndefined();
    await expect(service.hold('show-1', 'seat-1', 'hold-2')).rejects.toThrow(SeatNotAvailableError);

    const seat = await repo.findById('show-1', 'seat-1');
    expect(seat?.status).toBe('HELD');
    expect(seat?.holdId).toBe('hold-1');
  });
});
