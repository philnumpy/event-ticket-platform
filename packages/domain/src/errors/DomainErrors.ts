export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" was not found`);
  }
}

export class SeatNotAvailableError extends DomainError {
  constructor(seatId: string) {
    super(`Seat "${seatId}" is not available`);
  }
}

export class InvalidBookingStateTransitionError extends DomainError {
  constructor(fromState: string, trigger: string) {
    super(`Cannot apply trigger "${trigger}" while booking is in state "${fromState}"`);
  }
}

export class HoldExpiredError extends DomainError {
  constructor(holdId: string) {
    super(`Hold "${holdId}" has expired`);
  }
}

export class ValidationFailedError extends DomainError {}

export class TooManySeatsError extends ValidationFailedError {
  constructor(requested: number, max: number) {
    super(`Cannot book ${requested} seats in a single booking; max allowed is ${max}`);
  }
}

export class FraudSuspectedError extends ValidationFailedError {
  constructor(reason: string) {
    super(`Booking rejected by fraud check: ${reason}`);
  }
}

export class DuplicatePaymentError extends DomainError {
  constructor(idempotencyKey: string) {
    super(`Payment with idempotency key "${idempotencyKey}" was already processed`);
  }
}
