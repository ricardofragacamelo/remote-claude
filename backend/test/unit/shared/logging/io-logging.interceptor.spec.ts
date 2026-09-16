import { describe, expect, it } from 'vitest';
import { of, throwError } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { IoLoggingInterceptor } from '@shared/logging/io-logging.interceptor';
import { RecordingLogger } from '../../../support/fakes/recording-logger';

/** An execution context of a given transport, carrying a request and a response. */
function contextOf(type: 'http' | 'ws', body: unknown = { nonce: 'n' }): ExecutionContext {
  const request = { method: 'POST', originalUrl: '/auth/session', body };
  const response = { statusCode: 201 };

  return {
    getType: () => type,
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

    await new Promise((resolve) =>
      new IoLoggingInterceptor(log.logger)
        .intercept(
          contextOf('http'),
          handlerOf(() => throwError(() => new Error('boom'))),
        )
        .subscribe({ error: resolve }),
    );

    expect(log.withOp('http.response')[0]?.['msg']).toBe('http response failed');
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
