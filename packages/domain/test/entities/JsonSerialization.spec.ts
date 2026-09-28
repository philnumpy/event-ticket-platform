import { Booking } from '../../src/entities/Booking';
import { Hold } from '../../src/entities/Hold';
import { Payment } from '../../src/entities/Payment';
import { ShowSeat } from '../../src/entities/ShowSeat';
import { Show } from '../../src/entities/Show';
import { Money } from '../../src/shared/Money';

/**
 * TypeScript's `private` is compile-time only — at runtime these fields are
 * plain, enumerable `_state`/`_holdId`/etc. properties. Without a toJSON()
 * override, JSON.stringify (which is exactly what an HTTP framework calls
 * to serialize a response body) would leak that internal naming straight
 * into the API instead of going through the public getters. These tests
 * exist to catch a regression if a toJSON() override is ever removed.
 */
describe('JSON serialization does not leak private backing fields', () => {
  it('Booking serializes clean field names', () => {
    const booking = new Booking({
      id: 'b1',
      userId: 'u1',
      showId: 's1',
      seatIds: ['seat-1'],
      amount: Money.of(1000),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    booking.attachHold('hold-1');

    const json = JSON.parse(JSON.stringify(booking));
    expect(json).toMatchObject({ state: 'HELD', holdId: 'hold-1', paymentCaptured: false });
    expect(json).not.toHaveProperty('_state');
    expect(json).not.toHaveProperty('_holdId');
  });

  it('Hold serializes clean field names', () => {
    const hold = new Hold({
      id: 'h1',
      showId: 's1',
      seatIds: ['seat-1'],
      userId: 'u1',
      createdAt: new Date(),
      ttlSeconds: 300,
    });

    const json = JSON.parse(JSON.stringify(hold));
    expect(json).toMatchObject({ status: 'ACTIVE' });
    expect(json).not.toHaveProperty('_status');
  });

  it('Payment serializes clean field names', () => {
    const payment = new Payment({
      id: 'p1',
      bookingId: 'b1',
      amount: Money.of(1000),
      idempotencyKey: 'idem-1',
      provider: 'MOCK',
      createdAt: new Date(),
    });
    payment.markSuccess();

    const json = JSON.parse(JSON.stringify(payment));
    expect(json).toMatchObject({ status: 'SUCCESS' });
    expect(json).not.toHaveProperty('_status');
  });

  it('ShowSeat serializes clean field names', () => {
    const seat = new ShowSeat({ showId: 's1', seatId: 'seat-1' });
    seat.markHeld('hold-1');

    const json = JSON.parse(JSON.stringify(seat));
    expect(json).toMatchObject({ status: 'HELD', holdId: 'hold-1' });
    expect(json).not.toHaveProperty('_status');
    expect(json).not.toHaveProperty('_holdId');
  });

  it('Show serializes clean field names', () => {
    const show = new Show({
      id: 's1',
      eventId: 'e1',
      venueId: 'v1',
      startTime: new Date('2026-01-01T18:00:00Z'),
      endTime: new Date('2026-01-01T20:00:00Z'),
      basePriceByTier: { GOLD: Money.of(50000) },
    });

    const json = JSON.parse(JSON.stringify(show));
    expect(json).toMatchObject({ status: 'SCHEDULED' });
    expect(json).not.toHaveProperty('_status');
  });

  it('Money serializes to {amount, currency}', () => {
    expect(JSON.parse(JSON.stringify(Money.of(1500, 'INR')))).toEqual({
      amount: 1500,
      currency: 'INR',
    });
  });

  it('Money nested inside Booking also serializes cleanly', () => {
    const booking = new Booking({
      id: 'b1',
      userId: 'u1',
      showId: 's1',
      seatIds: ['seat-1'],
      amount: Money.of(50000, 'INR'),
      createdAt: new Date(),
    });

    const json = JSON.parse(JSON.stringify(booking));
    expect(json.amount).toEqual({ amount: 50000, currency: 'INR' });
  });
});
