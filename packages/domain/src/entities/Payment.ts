import { Money } from '../shared/Money';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT';

export interface PaymentProps {
  id: string;
  bookingId: string;
  amount: Money;
  idempotencyKey: string;
  provider: string;
  createdAt: Date;
  status?: PaymentStatus;
}

export class Payment {
  readonly id: string;
  readonly bookingId: string;
  readonly amount: Money;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly createdAt: Date;
  private _status: PaymentStatus;

  constructor(props: PaymentProps) {
    this.id = props.id;
    this.bookingId = props.bookingId;
    this.amount = props.amount;
    this.idempotencyKey = props.idempotencyKey;
    this.provider = props.provider;
    this.createdAt = props.createdAt;
    this._status = props.status ?? 'PENDING';
  }

  get status(): PaymentStatus {
    return this._status;
  }

  markSuccess(): void {
    this._status = 'SUCCESS';
  }

  markFailed(): void {
    this._status = 'FAILED';
  }

  markTimeout(): void {
    this._status = 'TIMEOUT';
  }
}
