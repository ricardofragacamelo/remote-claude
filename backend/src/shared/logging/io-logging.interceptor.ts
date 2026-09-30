import { AsyncLocalStorage } from 'node:async_hooks';

import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';
import type { Observable } from 'rxjs';

import { LOGGER } from './logger';
import type { Logger } from './logger';
import { OMITTED_FROM_LOG } from './omit-from-log.decorator';
import { forLog, omitting } from './redact';

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
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(Reflector) private readonly reflector: Reflector = new Reflector(),
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const omitted =
      this.reflector.get<readonly string[] | undefined>(OMITTED_FROM_LOG, context.getHandler()) ??
      [];
    const body = forLog(omitting(request.body, omitted));

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
        // log shows a request that never came back. It closes once that response is written: the
        // filter runs after this, and until then the status is Express's default 200, whatever the
        // error became. `close` fires also when the client gave up, so the pair closes either way —
        // bound to this request's context, or the line would lose its `traceId`.
        error: () => {
          const failed = AsyncLocalStorage.bind(() => {
            log('http response failed');
          });

          if (response.writableEnded) {
            failed();
            return;
          }

          response.once('close', failed);
        },
      }),
    );
  }
}
