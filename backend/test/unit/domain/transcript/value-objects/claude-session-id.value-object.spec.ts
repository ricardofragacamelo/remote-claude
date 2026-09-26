import { describe, expect, it } from 'vitest';

import { ClaudeSessionId, InvalidClaudeSessionIdError } from '@domain/transcript';

const CANONICAL = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

describe('ClaudeSessionId', () => {
  it('accepts the canonical UUID the SDK hands out', () => {
    expect(ClaudeSessionId.create(CANONICAL).value).toBe(CANONICAL);
  });

  it.each([
    ['empty', ''],
    ['uppercase', CANONICAL.toUpperCase()],
    ['without hyphens', CANONICAL.replaceAll('-', '')],
    ['one character short', CANONICAL.slice(1)],
    ['a ULID — our own session id', '01J0ABCDEFGHJKMNPQRSTVWXYZ'],
    ['a path', '../../etc/passwd'],
  ])('rejects an identifier that is %s', (_case, raw) => {
    expect(() => ClaudeSessionId.create(raw)).toThrow(InvalidClaudeSessionIdError);
    expect(ClaudeSessionId.parse(raw)).toBeNull();
  });

  it('reports INVALID_INPUT with the offending value as a parameter', () => {
    expect.assertions(3);

    try {
      ClaudeSessionId.create('nope');
    } catch (error) {
      expect((error as InvalidClaudeSessionIdError).code).toBe('INVALID_INPUT');
      expect((error as InvalidClaudeSessionIdError).messageKey).toBe(
        'transcript.error.invalidSessionId',
      );
      expect((error as InvalidClaudeSessionIdError).params).toEqual({ sessionId: 'nope' });
    }
  });

  it('parses the same rule as a question', () => {
    expect(ClaudeSessionId.parse(CANONICAL)?.value).toBe(CANONICAL);
  });

  it('is equal by value, and prints as it', () => {
    const id = ClaudeSessionId.create(CANONICAL);

    expect(id.equals(ClaudeSessionId.create(CANONICAL))).toBe(true);
    expect(id.equals(ClaudeSessionId.create('6b41b192-a41b-46c2-b8d7-000000000000'))).toBe(false);
    expect(String(id)).toBe(CANONICAL);
  });
});
