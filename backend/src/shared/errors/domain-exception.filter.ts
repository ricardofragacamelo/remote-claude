import { Catch, HttpException, Inject } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { DomainError } from '@domain/shared';
import { LOGGER } from '../logging/logger';
import type { Logger } from '../logging/logger';
import { currentTraceId } from '../logging/trace-context';
import { httpStatusFor, toErrorEnvelope } from './error-catalogue';
import { FrameworkHttpError } from './framework-http.error';

/**
 * The single point where a failure becomes an HTTP response.
 *
 * Every branch produces the same envelope, so no route can answer `200` with an error inside it,
 * and none can answer `500` for something the caller got wrong. Nothing internal crosses it: no
 * stack, no server path, no database message. See docs/architecture/shared/04-errors-and-http.md.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const traceId = currentTraceId() ?? 'unknown';
    const normalised = normaliseException(exception);
    const envelope = toErrorEnvelope(normalised, traceId);
    const status = httpStatusFor(envelope.error.code);

    const context = {
      op: 'http.error',
      layer: 'adapter',
      httpStatus: status,
      errorCode: envelope.error.code,
      err: normalised,
    };

    // An expected business failure is `warn`; `error` is for what nobody foresaw. Logging a
    // rejected token at `error` trains everyone to ignore the level.
    if (status >= 500) {
      this.logger.error(context, 'request failed');
    } else {
      this.logger.warn(context, 'request refused');
    }

    response.status(status).json(envelope);
  }
}

/** Turns what Nest and the body parser throw into something the catalogue knows. */
export function normaliseException(exception: unknown): unknown {
  if (exception instanceof DomainError) {
    return exception;
  }

  if (exception instanceof HttpException) {
    return new FrameworkHttpError(exception.getStatus());
  }

  return exception;
}
