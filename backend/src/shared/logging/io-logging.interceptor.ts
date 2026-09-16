import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';

import { LOGGER } from './logger';
import type { Logger } from './logger';
import { forLog } from './redact';

/**
 * Logs both sides of every HTTP edge, at `debug`.
 *
 * It is an interceptor and not a line inside each use case on purpose: logging its own I/O is the
 * outer layer's job, and a use case that does it is doing work that belongs to the boundary.
 *
 * Every entry has its matching exit, with the same `traceId` and a `durationMs` on the way out.
 * An entry with no exit is an operation still hanging, and that has to be visible.
 */
@Injectable()
export class IoLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const body = forLog(request.body);

    this.logger.debug(
      {
        op: 'http.request',
        layer: 'adapter',
        method: request.method,
        url: request.originalUrl,
        payload: body.payload,
        truncated: body.truncated,
      },
      'http request',
    );

    const log = (outcome: 'http response' | 'http response failed'): void => {
      this.logger.debug(
        {
          op: 'http.response',
          layer: 'adapter',
          method: request.method,
          url: request.originalUrl,
          httpStatus: response.statusCode,
          durationMs: Date.now() - startedAt,
        },
        outcome,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => {
          log('http response');
        },
        // The exception filter turns this into a response; the pair still has to close, or the
        // log shows a request that never came back.
        error: () => {
          log('http response failed');
        },
      }),
    );
  }
}
