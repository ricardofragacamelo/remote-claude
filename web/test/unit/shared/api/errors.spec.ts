import { describe, expect, it } from 'vitest';

import { AppError, toAppError, toTransportError } from '@/shared/api/errors';

describe('toAppError', () => {
  it('reads the backend envelope', () => {
    const error = toAppError(
      {
        error: {
          code: 'SESSION_NOT_FOUND',
          messageKey: 'session.error.notFound',
          traceId: 'trace-1',
          params: { sessionId: '01J0' },
        },
      },
      'fallback',
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('SESSION_NOT_FOUND');
    expect(error.messageKey).toBe('session.error.notFound');
    expect(error.traceId).toBe('trace-1');
    expect(error.params).toEqual({ sessionId: '01J0' });
  });

  it('keeps every invalid field the backend listed', () => {
    const error = toAppError(
      {
        error: {
          code: 'INVALID_INPUT',
          messageKey: 'common.error.invalidInput',
          traceId: 't',
          details: [{ field: 'code', rule: 'required' }],
        },
      },
      'fallback',
    );

    expect(error.details).toEqual([{ field: 'code', rule: 'required' }]);
  });

  it('falls back to our own trace when the envelope carries none', () => {
    const error = toAppError(
      { error: { code: 'X', messageKey: 'common.error.unexpected' } },
      'fallback',
    );

    expect(error.traceId).toBe('fallback');
  });

  it.each([
    ['an HTML error page', '<html>502</html>'],
    ['an empty body', undefined],
    ['null', null],
    ['an envelope with no code', { error: { messageKey: 'x', traceId: 't' } }],
    ['an envelope with no key', { error: { code: 'X', traceId: 't' } }],
  ])(
    'turns %s into the unexpected error, so the UI always has something to show',
    (_case, body) => {
      const error = toAppError(body, 'fallback');

      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.messageKey).toBe('common.error.unexpected');
      expect(error.traceId).toBe('fallback');
    },
  );

  it('ignores params that are not an object', () => {
    const error = toAppError(
      { error: { code: 'X', messageKey: 'k', traceId: 't', params: ['nope'] } },
      'fallback',
    );

    expect(error.params).toEqual({});
  });
});

describe('toTransportError', () => {
  it('reports a failure with no response at all as offline', () => {
    const error = toTransportError('trace-1');

    expect(error.code).toBe('NETWORK_UNREACHABLE');
    expect(error.messageKey).toBe('common.error.offline');
  });
});
