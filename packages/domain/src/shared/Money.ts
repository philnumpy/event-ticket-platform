/**
 * Money is always represented in integer minor units (e.g. paise/cents) to
 * avoid floating-point drift in price/refund arithmetic — a common source of
 * off-by-a-fraction bugs in booking systems.
 */
export class Money {
  private constructor(
    private readonly minorUnits: number,
    private readonly currency: string,
  ) {
    if (!Number.isInteger(minorUnits)) {
      throw new Error('Money must be represented in integer minor units (e.g. paise)');
    }
    if (minorUnits < 0) {
      throw new Error('Money cannot be negative');
    }
  }

  static of(minorUnits: number, currency = 'INR'): Money {
    return new Money(minorUnits, currency);
  }

  static zero(currency = 'INR'): Money {
    return new Money(0, currency);
  }

  get amount(): number {
    return this.minorUnits;
  }

  get currencyCode(): string {
    return this.currency;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits - other.minorUnits, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.minorUnits * factor), this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  toString(): string {
    return `${(this.minorUnits / 100).toFixed(2)} ${this.currency}`;
  }

  toJSON() {
    return { amount: this.minorUnits, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
