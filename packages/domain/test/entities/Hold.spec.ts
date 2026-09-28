import { Hold } from '../../src/entities/Hold';

describe('Hold', () => {
  const baseProps = {
    id: 'hold-1',
    showId: 'show-1',
    seatIds: ['seat-1', 'seat-2'],
    userId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ttlSeconds: 300,
  };

  it('rejects a hold with no seats', () => {
    expect(() => new Hold({ ...baseProps, seatIds: [] })).toThrow('at least one seat');
  });

  it('computes expiresAt from createdAt + ttlSeconds', () => {
    const hold = new Hold(baseProps);
    expect(hold.expiresAt.toISOString()).toBe('2026-01-01T00:05:00.000Z');
  });

  it('is not expired before expiresAt', () => {
    const hold = new Hold(baseProps);
    expect(hold.isExpired(new Date('2026-01-01T00:04:59Z'))).toBe(false);
  });

  it('is expired at or after expiresAt', () => {
    const hold = new Hold(baseProps);
    expect(hold.isExpired(new Date('2026-01-01T00:05:00Z'))).toBe(true);
    expect(hold.isExpired(new Date('2026-01-01T00:06:00Z'))).toBe(true);
  });

  it('consumes an active hold', () => {
    const hold = new Hold(baseProps);
    hold.consume();
    expect(hold.status).toBe('CONSUMED');
  });

  it('cannot consume a hold that is not active', () => {
    const hold = new Hold(baseProps);
    hold.expire();
    expect(() => hold.consume()).toThrow('Cannot consume a hold');
  });

  it('expire() is idempotent and only affects ACTIVE holds', () => {
    const hold = new Hold(baseProps);
    hold.consume();
    hold.expire(); // no-op, already CONSUMED
    expect(hold.status).toBe('CONSUMED');
  });

  it('release() only affects ACTIVE holds', () => {
    const hold = new Hold(baseProps);
    hold.release();
    expect(hold.status).toBe('RELEASED');

    const consumed = new Hold(baseProps);
    consumed.consume();
    consumed.release();
    expect(consumed.status).toBe('CONSUMED');
  });
});
