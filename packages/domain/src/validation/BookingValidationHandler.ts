import { BookingValidationRequest } from './BookingValidationRequest';

/** Chain of Responsibility: each handler either throws (rejecting the
 * booking) or passes the request to the next link. Assembling the chain is
 * left to the caller (see BookingValidationChain) so the ordering — and
 * which checks are even included — is a deployment-time decision, not one
 * baked into any single handler. */
export abstract class BookingValidationHandler {
  private next?: BookingValidationHandler;

  setNext(handler: BookingValidationHandler): BookingValidationHandler {
    this.next = handler;
    return handler;
  }

  handle(request: BookingValidationRequest): void {
    this.check(request);
    this.next?.handle(request);
  }

  protected abstract check(request: BookingValidationRequest): void;
}
