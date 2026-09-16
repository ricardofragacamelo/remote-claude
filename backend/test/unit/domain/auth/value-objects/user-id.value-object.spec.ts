import { describe, expect, it } from 'vitest';

import { InvalidUserIdError, UserId } from '@domain/auth';

describe('UserId', () => {
  it('accepts a subject claim', () => {
    expect(UserId.create('auth|42').value).toBe('auth|42');
  });

  it.each([
    ['empty', ''],
    ['only whitespace', '   '],
  ])('rejects a subject that is %s', (_case, raw) => {
    expect(() => UserId.create(raw)).toThrow(InvalidUserIdError);
  });

  it('reports the rejection as UNAUTHENTICATED, saying nothing more', () => {
    expect.assertions(2);

    try {
      UserId.create('');
    } catch (error) {
      expect((error as InvalidUserIdError).code).toBe('UNAUTHENTICATED');
      expect((error as InvalidUserIdError).messageKey).toBe('auth.error.unauthenticated');
    }
  });

  it('is equal to another instance of the same subject', () => {
    expect(UserId.create('auth|42').equals(UserId.create('auth|42'))).toBe(true);
  });

  it('is not equal to a different subject', () => {
    expect(UserId.create('auth|42').equals(UserId.create('auth|43'))).toBe(false);
  });

  it('prints as its value', () => {
    expect(String(UserId.create('auth|42'))).toBe('auth|42');
  });
});
