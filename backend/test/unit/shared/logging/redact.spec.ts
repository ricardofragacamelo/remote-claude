import { describe, expect, it } from 'vitest';

import {
  forLog,
  framePayloadForLog,
  isSensitive,
  MAX_PAYLOAD_BYTES,
  omitting,
  redact,
  REDACTED,
} from '@shared/logging/redact';

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

describe('omitting — plan 06, S-178', () => {
  it('replaces the named fields of a body, and only them', () => {
    expect(omitting({ params: { folder: '/x' }, messageKey: 'k.k.k' }, ['params'])).toEqual({
      params: REDACTED,
      messageKey: 'k.k.k',
    });
  });

  it('leaves a body alone when nothing is named', () => {
    const body = { params: 1 };

    expect(omitting(body, [])).toBe(body);
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'text'],
    ['a list', ['params']],
  ])('leaves %s as it is', (_case, value) => {
    expect(omitting(value, ['params'])).toBe(value);
  });
});

describe('framePayloadForLog — plan 08, S-204', () => {
  it('keeps the content of the context of a prompt out, and says it was there', () => {
    expect(
      framePayloadForLog('session.prompt', {
        sessionId: 's',
        text: 't',
        attachments: [
          { kind: 'text', source: 'terminal', label: 'bash', content: '$ secret' },
          { kind: 'file', path: 'a.ts' },
          'odd',
        ],
      }),
    ).toEqual({
      sessionId: 's',
      text: 't',
      attachments: [
        { kind: 'text', source: 'terminal', label: 'bash', content: REDACTED },
        { kind: 'file', path: 'a.ts' },
        'odd',
      ],
    });
  });

  it('leaves the frames of other types, and a prompt without context, as they are', () => {
    const payload = { content: 'x' };

    expect(framePayloadForLog('session.start', payload)).toBe(payload);
    expect(framePayloadForLog('session.prompt', { text: 'a' })).toEqual({ text: 'a' });
    expect(framePayloadForLog('session.prompt', null)).toBeNull();
  });
});
