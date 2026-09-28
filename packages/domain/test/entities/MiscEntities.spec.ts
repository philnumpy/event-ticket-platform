import { Seat } from '../../src/entities/Seat';
import { Event } from '../../src/entities/Event';
import { Show } from '../../src/entities/Show';
import { Money } from '../../src/shared/Money';

describe('Seat', () => {
  it('formats a human-readable label from section/row/number', () => {
    const seat = new Seat({ id: 's1', venueId: 'v1', section: 'A', row: 'B', seatNumber: 12, tier: 'GOLD' });
    expect(seat.label).toBe('A-B12');
  });
});

describe('Event', () => {
  it('rejects a non-positive duration', () => {
    expect(
      () => new Event({ id: 'e1', title: 'X', genre: 'DRAMA', durationMinutes: 0 }),
    ).toThrow('durationMinutes must be positive');
  });
});

describe('Show', () => {
  const baseProps = {
    id: 'show-1',
    eventId: 'e1',
    venueId: 'v1',
    startTime: new Date('2026-01-01T18:00:00Z'),
    endTime: new Date('2026-01-01T20:00:00Z'),
    basePriceByTier: { GOLD: Money.of(50000) },
  };

  it('rejects an endTime that is not after startTime', () => {
    expect(
      () => new Show({ ...baseProps, endTime: baseProps.startTime }),
    ).toThrow('endTime must be after startTime');
  });

  it('defaults to SCHEDULED and can be cancelled', () => {
    const show = new Show(baseProps);
    expect(show.status).toBe('SCHEDULED');
    show.cancel();
    expect(show.status).toBe('CANCELLED');
  });

  it('throws when asked for a price on a tier that was never configured', () => {
    const show = new Show(baseProps);
    expect(() => show.basePriceFor('SILVER')).toThrow('No base price configured');
  });

  it('computes hoursUntilStart relative to a given time', () => {
    const show = new Show(baseProps);
    expect(show.hoursUntilStart(new Date('2026-01-01T12:00:00Z'))).toBe(6);
    expect(show.hoursUntilStart(new Date('2026-01-01T20:00:00Z'))).toBe(-2);
  });
});
