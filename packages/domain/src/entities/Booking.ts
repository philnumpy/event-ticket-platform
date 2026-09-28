import { Money } from '../shared/Money';
import { BookingState, BookingTrigger } from '../booking/BookingState';
import { BookingStateMachine } from '../booking/BookingStateMachine';

export interface BookingProps {
  id: string;
  userId: string;
  showId: string;
  seatIds: string[];
  amount: Money;
  createdAt: Date;
  state?: BookingState;
  paymentCaptured?: boolean;
  holdId?: string | null;
  /** Reconstruction only (e.g. loading a persisted row) — new bookings
   * always start with updatedAt === createdAt. */
  updatedAt?: Date;
}

/** Aggregate root for the booking lifecycle. Never mutates state directly —
 * every transition goes through BookingStateMachine so illegal transitions
 * throw instead of silently corrupting state. */
export class Booking {
  readonly id: string;
  readonly userId: string;
  readonly showId: string;
  readonly seatIds: string[];
  readonly amount: Money;
  readonly createdAt: Date;
  private _state: BookingState;
  private _paymentCaptured: boolean;
  private _holdId: string | null;
  private _updatedAt: Date;

  constructor(props: BookingProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.showId = props.showId;
    this.seatIds = props.seatIds;
    this.amount = props.amount;
    this.createdAt = props.createdAt;
    this._state = props.state ?? BookingState.INITIATED;
    this._paymentCaptured = props.paymentCaptured ?? false;
    this._holdId = props.holdId ?? null;
    this._updatedAt = props.updatedAt ?? props.createdAt;
  }

  get state(): BookingState {
    return this._state;
  }

  get paymentCaptured(): boolean {
    return this._paymentCaptured;
  }

  get holdId(): string | null {
    return this._holdId;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  private transition(trigger: BookingTrigger): void {
    this._state = BookingStateMachine.apply(this._state, trigger, {
      paymentCaptured: this._paymentCaptured,
    });
    this._updatedAt = new Date();
  }

  attachHold(holdId: string): void {
    this._holdId = holdId;
    this.transition(BookingTrigger.HOLD_ACQUIRED);
  }

  rejectBeforeHold(): void {
    this.transition(BookingTrigger.REJECTED_BEFORE_HOLD);
  }

  markPaymentCaptured(): void {
    this._paymentCaptured = true;
    this.transition(BookingTrigger.PAYMENT_CAPTURED);
  }

  markFinalizationSucceeded(): void {
    this.transition(BookingTrigger.FINALIZATION_SUCCEEDED);
  }

  markFinalizationFailed(): void {
    this.transition(BookingTrigger.FINALIZATION_FAILED);
  }

  markExpired(): void {
    this.transition(BookingTrigger.HOLD_EXPIRED);
  }

  cancel(): void {
    this.transition(BookingTrigger.CANCEL_REQUESTED);
  }

  markRefunded(): void {
    this.transition(BookingTrigger.REFUND_PROCESSED);
  }

  isTerminal(): boolean {
    return BookingStateMachine.isTerminal(this._state, { paymentCaptured: this._paymentCaptured });
  }
}
