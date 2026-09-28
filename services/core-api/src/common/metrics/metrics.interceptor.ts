import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { httpRequestDuration, httpRequestsTotal } from './metrics.registry';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const stopTimer = httpRequestDuration.startTimer();
    // req.route is only populated once Nest's router has matched a
    // handler; falling back to the raw path is only reachable for a 404
    // where no route ever matched.
    const route = (): string => req.route?.path ?? req.path;

    const record = (): void => {
      const labels = { method: req.method, route: route(), status_code: String(res.statusCode) };
      stopTimer(labels);
      httpRequestsTotal.inc(labels);
    };

    return next.handle().pipe(
      tap({
        next: record,
        error: record,
      }),
    );
  }
}
