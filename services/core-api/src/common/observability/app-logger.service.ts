import { LoggerService } from '@nestjs/common';
import pino from 'pino';
import { getCorrelationId } from './correlation-context';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'core-api' },
});

/**
 * Replaces Nest's default console logger (wired via `app.useLogger` in
 * main.ts) with structured JSON lines, each carrying whatever correlation
 * ID is active in AsyncLocalStorage for the request/job currently running
 * — no call site has to pass it explicitly. `context` is Nest's own
 * per-class logger label (`new Logger(SomeService.name)`), kept as its own
 * field rather than folded into the message string so it stays queryable.
 */
export class AppLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    pinoLogger.info({ correlationId: getCorrelationId(), context }, this.toMessage(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    pinoLogger.error({ correlationId: getCorrelationId(), context, trace }, this.toMessage(message));
  }

  warn(message: unknown, context?: string): void {
    pinoLogger.warn({ correlationId: getCorrelationId(), context }, this.toMessage(message));
  }

  debug(message: unknown, context?: string): void {
    pinoLogger.debug({ correlationId: getCorrelationId(), context }, this.toMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    pinoLogger.trace({ correlationId: getCorrelationId(), context }, this.toMessage(message));
  }

  private toMessage(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}
