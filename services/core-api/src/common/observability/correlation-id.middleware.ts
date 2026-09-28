import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { correlationStorage } from './correlation-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * The single entry point for a request's correlation ID: reuse the
 * caller's if they supplied one (letting a client's own trace ID flow
 * through, or letting this be chained behind another gateway), otherwise
 * mint a fresh one. Echoed back in the response header so a client can log
 * it for their own support/debugging purposes, and wraps the rest of the
 * request in `correlationStorage.run(...)` so every log line and every
 * outbox/Kafka message this request causes can pick it up.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = req.header(CORRELATION_ID_HEADER) || randomUUID();
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    correlationStorage.run({ correlationId }, next);
  }
}
