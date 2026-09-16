import { describe, expect, it } from 'vitest';

import { Pong, SessionId } from '@domain/session';

const id = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const other = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY0');
const at = new Date('2026-09-13T12:00:00.000Z');

describe('Pong', () => {
  it('is equal to another pong with the same content', () => {
    expect(new Pong(id, at, 1, 'n').equals(new Pong(id, new Date(at), 1, 'n'))).toBe(true);
  });

  it.each([
    ['session', new Pong(other, at, 1, 'n')],
    ['instant', new Pong(id, new Date('2026-09-13T12:00:01.000Z'), 1, 'n')],
    ['count', new Pong(id, at, 2, 'n')],
    ['nonce', new Pong(id, at, 1, 'other')],
  ])('is not equal when the %s differs', (_field, candidate) => {
    expect(new Pong(id, at, 1, 'n').equals(candidate)).toBe(false);
  });
});
