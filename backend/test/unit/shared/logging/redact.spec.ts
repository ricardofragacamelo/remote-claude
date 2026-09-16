import { describe, expect, it } from 'vitest';

import { forLog, isSensitive, MAX_PAYLOAD_BYTES, redact, REDACTED } from '@shared/logging/redact';

describe('isSensitive', () => {
  it.each([
    'authorization',
    'Authorization',
    'cookie',
    'set-cookie',
    'access_token',
    'refreshToken',
    'idToken',
    'password',
    'clientSecret',
    'apiKey',
    'api_key',
    'codeVerifier',
    'pushCredential',
  ])('treats %s as sensitive', (name) => {
    expect(isSensitive(name)).toBe(true);
  });

  it.each(['traceId', 'sessionId', 'connectionId', 'userId', 'durationMs', 'msg'])(
    'leaves %s alone',
    (name) => {
      expect(isSensitive(name)).toBe(false);
    },
  );
});

describe('redact', () => {
  it('replaces a sensitive field at the top level', () => {
    expect(redact({ token: 'secret', sessionId: 'abc' })).toEqual({
      token: REDACTED,
      sessionId: 'abc',
    });
  });

  it('replaces a sensitive field at any depth', () => {
    expect(redact({ a: { b: { headers: { authorization: 'Bearer x' } } } })).toEqual({
      a: { b: { headers: { authorization: REDACTED } } },
    });
  });

  it('walks into arrays', () => {
    expect(redact([{ password: 'p' }, { ok: 1 }])).toEqual([{ password: REDACTED }, { ok: 1 }]);
  });

  it.each([
    ['a string', 'plain'],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
  ])('returns %s unchanged', (_case, value) => {
    expect(redact(value)).toEqual(value);
  });

  it('stops descending rather than following a structure without end', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(() => redact(cyclic)).not.toThrow();
  });
});

describe('forLog', () => {
  it('redacts before it measures', () => {
    expect(forLog({ token: 'secret' })).toEqual({ payload: { token: REDACTED }, truncated: false });
  });

  it('leaves a payload under the cap whole', () => {
    const payload = { text: 'x'.repeat(100) };

    expect(forLog(payload)).toEqual({ payload, truncated: false });
  });

  it('truncates over the cap, and says so instead of dropping it', () => {
    const result = forLog({ text: 'x'.repeat(MAX_PAYLOAD_BYTES * 2) });

    expect(result.truncated).toBe(true);
    expect(String(result.payload)).toHaveLength(MAX_PAYLOAD_BYTES);
  });

  it('handles a value JSON cannot serialise', () => {
    expect(forLog(undefined)).toEqual({ payload: undefined, truncated: false });
  });
});
