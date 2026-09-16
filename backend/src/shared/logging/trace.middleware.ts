import { Inject, Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import type { IdGenerator } from '@domain/shared';
import { ID_GENERATOR } from '@application/shared';
import { runWithTrace } from './trace-context';

/** Header the trace travels in, on the way in and on the way out. */
export const TRACE_HEADER = 'x-trace-id';

/**
 * Puts a trace on every request.
 *
 * The trace is born at the client, on the click. When one does not arrive the backend mints it
 * and echoes it back, so the caller can quote it in a bug report either way —
 * docs/architecture/shared/03-logging.md#traceid--como-propaga.
 */
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  constructor(@Inject(ID_GENERATOR) private readonly ids: IdGenerator) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const received = request.header(TRACE_HEADER);
    const traceId = received === undefined || received.trim() === '' ? this.ids.next() : received;

    response.setHeader(TRACE_HEADER, traceId);
    runWithTrace({ traceId }, () => {
      next();
    });
  }
}
