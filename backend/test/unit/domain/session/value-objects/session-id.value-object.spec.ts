import { describe, expect, it } from 'vitest';

import { InvalidSessionIdError, SessionId } from '@domain/session';

describe('SessionId', () => {
  it('accepts a ULID', () => {
    const id = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');

    expect(id.value).toBe('01J0ABCDEFGHJKMNPQRSTVWXYZ');
  });

  it.each([
    ['empty', ''],
    ['too short', '01J0ABCDEFGHJKMNPQRSTVWXY'],
    ['too long', '01J0ABCDEFGHJKMNPQRSTVWXYZ0'],
    ['lowercase', '01j0abcdefghjkmnpqrstvwxyz'],
    ['excluded letter I', '01J0ABCDEFGHIJKMNPQRSTVWXY'],
    ['a UUID', '3f8a7c2e-1b4d-4e5f-9a0b-1c2d3e4f5a6b'],
  ])('rejects an identifier that is %s', (_case, raw) => {
    expect(() => SessionId.create(raw)).toThrow(InvalidSessionIdError);
  });

  it('reports INVALID_INPUT with the offending value as a parameter', () => {
    expect.assertions(3);

    try {
      SessionId.create('nope');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSessionIdError);
      expect((error as InvalidSessionIdError).code).toBe('INVALID_INPUT');
      expect((error as InvalidSessionIdError).params).toEqual({ sessionId: 'nope' });
    }
  });

  it('is equal to another instance of the same value', () => {
    const raw = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

    expect(SessionId.create(raw).equals(SessionId.create(raw))).toBe(true);
  });

  it('is not equal to a different value', () => {
    const one = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
    const other = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0');

    expect(one.equals(other)).toBe(false);
  });

  it('prints as its value', () => {
    expect(String(SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'))).toBe(
      '01J0ABCDEFGHJKMNPQRSTVWXYZ',
    );
  });
});
