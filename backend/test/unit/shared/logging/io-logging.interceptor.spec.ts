import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';
import { of, throwError } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { IoLoggingInterceptor } from '@shared/logging/io-logging.interceptor';
import { OmitFromLog } from '@shared/logging/omit-from-log.decorator';
import { runWithTrace } from '@shared/logging/trace-context';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** A route method, optionally marked with the fields its log leaves out. */
function route(...omitted: readonly string[]): () => void {
  const method = (): void => undefined;

  if (omitted.length > 0) {
    OmitFromLog(...omitted)({}, 'method', { value: method });
  }

  return method;
}

/** The response Express hands the interceptor: a status, whether it was written, and its events. */
class FakeResponse extends EventEmitter {
  statusCode = 201;
  writableEnded = false;

  /** What the exception filter does after the interceptor: sets the status, and writes. */
  written(status: number): void {
    this.statusCode = status;
    this.writableEnded = true;
    this.emit('close');
  }
}

/** An execution context of a given transport, carrying a request and a response. */
function contextOf(
  type: 'http' | 'ws',
  body: unknown = { nonce: 'n' },
  handlerMethod: () => void = route(),
  response: FakeResponse = new FakeResponse(),
): ExecutionContext {
  const request = { method: 'POST', originalUrl: '/auth/session', body };

  return {
    getType: () => type,
    getHandler: () => handlerMethod,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

const handlerOf = (source: CallHandler['handle']): CallHandler => ({ handle: source });

describe('IoLoggingInterceptor', () => {
  it('logs both halves of an HTTP edge', async () => {
    const log = new RecordingLogger();

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http'),
          handlerOf(() => of('done')),
        )
        .subscribe(resolve),
    );

    expect(log.withOp('http.request')).toHaveLength(1);
    expect(log.withOp('http.response')[0]).toMatchObject({
      httpStatus: 201,
      durationMs: expect.any(Number),
    });
  });

  it('closes the pair even when the handler throws, so no request is left hanging', async () => {
    const log = new RecordingLogger();
    const response = new FakeResponse();

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http', undefined, undefined, response),
          handlerOf(() => throwError(() => new Error('boom'))),
        )
        .subscribe({ error: resolve }),
    );
    response.written(404);

    expect(log.withOp('http.response')).toEqual([
      expect.objectContaining({ msg: 'http response failed', httpStatus: 404 }),
    ]);
  });

  it('logs a failure with the status the error became, not the default before it was written', async () => {
    const log = new RecordingLogger();
    const response = new FakeResponse();
    response.statusCode = 200;

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http', undefined, undefined, response),
          handlerOf(() => throwError(() => new Error('refused'))),
        )
        .subscribe({ error: resolve }),
    );

    // The exception filter has not written anything yet: nothing is said about the response.
    expect(log.withOp('http.response')).toEqual([]);
    response.written(403);
    expect(log.withOp('http.response')[0]).toMatchObject({ httpStatus: 403 });
  });

  it('logs at once a failure whose response was already written', async () => {
    const log = new RecordingLogger();
    const response = new FakeResponse();
    response.statusCode = 500;
    response.writableEnded = true;

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http', undefined, undefined, response),
          handlerOf(() => throwError(() => new Error('late'))),
        )
        .subscribe({ error: resolve }),
    );

    expect(log.withOp('http.response')[0]).toMatchObject({ httpStatus: 500 });
  });

  it('keeps the trace of the request on a failure logged when the response is written', async () => {
    const log = new RecordingLogger();
    const response = new FakeResponse();

    await runWithTrace(
      { traceId: 'trace-failed' },
      () =>
        new Promise((resolve) =>
          new IoLoggingInterceptor(log.logger)
            .intercept(
              contextOf('http', undefined, undefined, response),
              handlerOf(() => throwError(() => new Error('boom'))),
            )
            .subscribe({ error: resolve }),
        ),
    );
    response.written(401);

    expect(log.withOp('http.response')[0]).toMatchObject({
      traceId: 'trace-failed',
      httpStatus: 401,
    });
  });

  it('redacts the body before writing it', async () => {
    const log = new RecordingLogger();

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http', { token: 'super-secret' }),
          handlerOf(() => of('done')),
        )
        .subscribe(resolve),
    );

    expect(JSON.stringify(log.lines)).not.toContain('super-secret');
  });

  it('leaves out the fields the route marked, whatever they are called — plan 06, S-178', async () => {
    const log = new RecordingLogger();
    const body = {
      messageKey: 'notification.folder.notAllowed',
      params: { folder: '/srv/secret' },
    };

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http', body, route('params')),
          handlerOf(() => of('done')),
        )
        .subscribe(resolve),
    );

    expect(JSON.stringify(log.lines)).not.toContain('/srv/secret');
    expect(log.withOp('http.request')[0]?.['payload']).toEqual({
      messageKey: 'notification.folder.notAllowed',
      params: '[REDACTED]',
    });
  });

  it('says so when the body was too big to write whole', async () => {
    const log = new RecordingLogger();

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http', { blob: 'x'.repeat(20_000) }),
          handlerOf(() => of('done')),
        )
        .subscribe(resolve),
    );

    expect(log.withOp('http.request')[0]).toMatchObject({ truncated: true });
  });

  it('leaves a WebSocket frame alone — the gateway logs that edge itself', async () => {
    const log = new RecordingLogger();

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('ws'),
          handlerOf(() => of('done')),
        )
        .subscribe(resolve),
    );

    expect(log.lines).toEqual([]);
  });
});
