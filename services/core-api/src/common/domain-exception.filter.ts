import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import {
  DomainError,
  FraudSuspectedError,
  HoldExpiredError,
  InvalidBookingStateTransitionError,
  NotFoundError,
  SeatNotAvailableError,
  TooManySeatsError,
  ValidationFailedError,
} from '@etp/domain';

// Order matters: more specific subclasses (TooManySeatsError,
// FraudSuspectedError) must come before their base class
// (ValidationFailedError) since this is checked with `instanceof` in order.
const STATUS_BY_ERROR: Array<[new (...args: never[]) => DomainError, number]> = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [SeatNotAvailableError, HttpStatus.CONFLICT],
  [HoldExpiredError, HttpStatus.GONE],
  [InvalidBookingStateTransitionError, HttpStatus.CONFLICT],
  [TooManySeatsError, HttpStatus.UNPROCESSABLE_ENTITY],
  [FraudSuspectedError, HttpStatus.FORBIDDEN],
  [ValidationFailedError, HttpStatus.UNPROCESSABLE_ENTITY],
];

/** Translates the @etp/domain error hierarchy into HTTP responses at the
 * one edge of the system that should know both vocabularies exist. Domain
 * code never imports anything HTTP-shaped. */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.resolveStatus(exception);
    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }

  private resolveStatus(exception: DomainError): number {
    for (const [errorClass, status] of STATUS_BY_ERROR) {
      if (exception instanceof errorClass) {
        return status;
      }
    }
    return HttpStatus.BAD_REQUEST;
  }
}
