import { BookingState, BookingTrigger } from '../../src/booking/BookingState';
import { BookingStateMachine } from '../../src/booking/BookingStateMachine';
import { InvalidBookingStateTransitionError } from '../../src/errors/DomainErrors';

describe('BookingStateMachine', () => {
  const legalTransitions: Array<[BookingState, BookingTrigger, BookingState]> = [
    [BookingState.INITIATED, BookingTrigger.HOLD_ACQUIRED, BookingState.HELD],
    [BookingState.INITIATED, BookingTrigger.REJECTED_BEFORE_HOLD, BookingState.CANCELLED],
    [BookingState.HELD, BookingTrigger.PAYMENT_CAPTURED, BookingState.PAID],
    [BookingState.HELD, BookingTrigger.HOLD_EXPIRED, BookingState.EXPIRED],
    [BookingState.HELD, BookingTrigger.CANCEL_REQUESTED, BookingState.CANCELLED],
    [BookingState.PAID, BookingTrigger.FINALIZATION_SUCCEEDED, BookingState.CONFIRMED],
    [BookingState.PAID, BookingTrigger.FINALIZATION_FAILED, BookingState.CANCELLED],
    [BookingState.CONFIRMED, BookingTrigger.CANCEL_REQUESTED, BookingState.CANCELLED],
  ];

  it.each(legalTransitions)('allows %s --%s--> %s', (from, trigger, to) => {
    expect(BookingStateMachine.apply(from, trigger)).toBe(to);
  });

  it('allows CANCELLED --REFUND_PROCESSED--> REFUNDED only when payment was captured', () => {
    expect(
      BookingStateMachine.apply(BookingState.CANCELLED, BookingTrigger.REFUND_PROCESSED, {
        paymentCaptured: true,
      }),
    ).toBe(BookingState.REFUNDED);
  });

  it('rejects CANCELLED --REFUND_PROCESSED--> * when payment was never captured', () => {
    expect(() =>
      BookingStateMachine.apply(BookingState.CANCELLED, BookingTrigger.REFUND_PROCESSED, {
        paymentCaptured: false,
      }),
    ).toThrow(InvalidBookingStateTransitionError);
  });

  const illegalTransitions: Array<[BookingState, BookingTrigger]> = [
    [BookingState.INITIATED, BookingTrigger.PAYMENT_CAPTURED],
    [BookingState.HELD, BookingTrigger.REJECTED_BEFORE_HOLD],
    [BookingState.PAID, BookingTrigger.HOLD_EXPIRED],
    [BookingState.CONFIRMED, BookingTrigger.PAYMENT_CAPTURED],
    [BookingState.EXPIRED, BookingTrigger.CANCEL_REQUESTED],
    [BookingState.REFUNDED, BookingTrigger.CANCEL_REQUESTED],
  ];

  it.each(illegalTransitions)('rejects %s --%s--> *', (from, trigger) => {
    expect(() => BookingStateMachine.apply(from, trigger)).toThrow(
      InvalidBookingStateTransitionError,
    );
  });

  describe('isTerminal', () => {
    it('treats EXPIRED and REFUNDED as always terminal', () => {
      expect(BookingStateMachine.isTerminal(BookingState.EXPIRED)).toBe(true);
      expect(BookingStateMachine.isTerminal(BookingState.REFUNDED)).toBe(true);
    });

    it('treats CANCELLED as terminal only when payment was not captured', () => {
      expect(BookingStateMachine.isTerminal(BookingState.CANCELLED, { paymentCaptured: false })).toBe(
        true,
      );
      expect(BookingStateMachine.isTerminal(BookingState.CANCELLED, { paymentCaptured: true })).toBe(
        false,
      );
    });

    it('treats in-flight states as non-terminal', () => {
      expect(BookingStateMachine.isTerminal(BookingState.INITIATED)).toBe(false);
      expect(BookingStateMachine.isTerminal(BookingState.HELD)).toBe(false);
      expect(BookingStateMachine.isTerminal(BookingState.PAID)).toBe(false);
      expect(BookingStateMachine.isTerminal(BookingState.CONFIRMED)).toBe(false);
    });
  });
});
