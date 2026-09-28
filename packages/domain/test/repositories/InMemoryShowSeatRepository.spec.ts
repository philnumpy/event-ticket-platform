import { InMemoryShowSeatRepository } from '../../src/repositories/in-memory/InMemoryShowSeatRepository';
import { ShowSeat } from '../../src/entities/ShowSeat';

describe('InMemoryShowSeatRepository.tryTransition', () => {
  it('returns false for a seat with no inventory row', async () => {
    const repo = new InMemoryShowSeatRepository();
    const ok = await repo.tryTransition({
      showId: 's1',
      seatId: 'missing',
      from: 'AVAILABLE',
      to: 'HELD',
      holdId: 'h1',
    });
    expect(ok).toBe(false);
  });

  it('transitions AVAILABLE -> HELD without an ownership check', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: 's1', seatId: 'seat-1' }));

    const ok = await repo.tryTransition({
      showId: 's1',
      seatId: 'seat-1',
      from: 'AVAILABLE',
      to: 'HELD',
      holdId: 'h1',
    });

    expect(ok).toBe(true);
    const seat = await repo.findById('s1', 'seat-1');
    expect(seat?.status).toBe('HELD');
    expect(seat?.holdId).toBe('h1');
  });

  it('rejects a transition when the current status does not match `from`', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: 's1', seatId: 'seat-1', status: 'BOOKED', holdId: 'h1' }));

    const ok = await repo.tryTransition({
      showId: 's1',
      seatId: 'seat-1',
      from: 'HELD',
      to: 'AVAILABLE',
      holdId: 'h1',
    });

    expect(ok).toBe(false);
  });

  it('rejects a transition away from HELD/BOOKED when holdId does not match the current owner', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: 's1', seatId: 'seat-1', status: 'HELD', holdId: 'owner-hold' }));

    const ok = await repo.tryTransition({
      showId: 's1',
      seatId: 'seat-1',
      from: 'HELD',
      to: 'BOOKED',
      holdId: 'someone-elses-hold',
    });

    expect(ok).toBe(false);
    const seat = await repo.findById('s1', 'seat-1');
    expect(seat?.status).toBe('HELD'); // unchanged
  });

  it('clears holdId when transitioning to AVAILABLE', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: 's1', seatId: 'seat-1', status: 'HELD', holdId: 'h1' }));

    await repo.tryTransition({ showId: 's1', seatId: 'seat-1', from: 'HELD', to: 'AVAILABLE', holdId: 'h1' });

    const seat = await repo.findById('s1', 'seat-1');
    expect(seat?.status).toBe('AVAILABLE');
    expect(seat?.holdId).toBeNull();
  });

  it('only lets one of two concurrent HELD->BOOKED vs HELD->AVAILABLE transitions win (the sweep-vs-payment race)', async () => {
    const repo = new InMemoryShowSeatRepository();
    await repo.save(new ShowSeat({ showId: 's1', seatId: 'seat-1', status: 'HELD', holdId: 'h1' }));

    const [bookedResult, releasedResult] = await Promise.all([
      repo.tryTransition({ showId: 's1', seatId: 'seat-1', from: 'HELD', to: 'BOOKED', holdId: 'h1' }),
      repo.tryTransition({ showId: 's1', seatId: 'seat-1', from: 'HELD', to: 'AVAILABLE', holdId: 'h1' }),
    ]);

    // Exactly one of "payment confirms" and "sweep expires" can win --
    // never both, and never neither.
    expect([bookedResult, releasedResult].filter(Boolean)).toHaveLength(1);
  });
});
