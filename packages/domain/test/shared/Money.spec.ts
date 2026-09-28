import { Money } from '../../src/shared/Money';

describe('Money', () => {
  it('adds and subtracts amounts in the same currency', () => {
    const a = Money.of(1000, 'INR');
    const b = Money.of(250, 'INR');

    expect(a.add(b).amount).toBe(1250);
    expect(a.subtract(b).amount).toBe(750);
  });

  it('multiplies and rounds to the nearest minor unit', () => {
    const price = Money.of(999, 'INR');
    expect(price.multiply(1.5).amount).toBe(1499); // 1498.5 rounds to 1499
  });

  it('rejects non-integer minor units', () => {
    expect(() => Money.of(10.5, 'INR')).toThrow('integer minor units');
  });

  it('rejects negative amounts', () => {
    expect(() => Money.of(-5, 'INR')).toThrow('cannot be negative');
  });

  it('throws on cross-currency arithmetic', () => {
    const inr = Money.of(100, 'INR');
    const usd = Money.of(100, 'USD');
    expect(() => inr.add(usd)).toThrow('Currency mismatch');
    expect(() => inr.subtract(usd)).toThrow('Currency mismatch');
    expect(() => inr.isGreaterThan(usd)).toThrow('Currency mismatch');
  });

  it('compares amounts', () => {
    expect(Money.of(200).isGreaterThan(Money.of(100))).toBe(true);
    expect(Money.of(100).isGreaterThan(Money.of(200))).toBe(false);
  });

  it('reports zero correctly', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.of(1).isZero()).toBe(false);
  });

  it('checks equality by amount and currency', () => {
    expect(Money.of(100, 'INR').equals(Money.of(100, 'INR'))).toBe(true);
    expect(Money.of(100, 'INR').equals(Money.of(100, 'USD'))).toBe(false);
    expect(Money.of(100, 'INR').equals(Money.of(200, 'INR'))).toBe(false);
  });

  it('formats as a decimal string', () => {
    expect(Money.of(150099, 'INR').toString()).toBe('1500.99 INR');
  });
});
