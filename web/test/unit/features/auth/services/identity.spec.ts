import { describe, expect, it } from 'vitest';

import { displayNameOf } from '@/features/auth/services/identity';

/** An ID token with these claims — unsigned, which is all a display needs. */
function tokenWith(claims: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const payload = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `header.${payload}.signature`;
}

const session = { accessToken: 'a', userId: 'auth|42', expiresAt: 0 };

describe('what to call whoever is signed in', () => {
  it('is their name, when the token carries one', () => {
    expect(
      displayNameOf({ ...session, idToken: tokenWith({ name: 'Ana Souza', email: 'a@x' }) }),
    ).toBe('Ana Souza');
  });

  it('keeps a name written in any script', () => {
    expect(displayNameOf({ ...session, idToken: tokenWith({ name: 'João Ação' }) })).toBe(
      'João Ação',
    );
  });

  it('is the username, then the email, when there is no name', () => {
    expect(
      displayNameOf({
        ...session,
        idToken: tokenWith({ preferred_username: 'ana', email: 'a@x' }),
      }),
    ).toBe('ana');
    expect(displayNameOf({ ...session, idToken: tokenWith({ email: 'a@x', name: '  ' }) })).toBe(
      'a@x',
    );
  });

  it('is the user id without a token, with a token that names nobody, or one that cannot be read', () => {
    expect(displayNameOf({ ...session, idToken: null })).toBe('auth|42');
    expect(displayNameOf({ ...session, idToken: tokenWith({ sub: 'x' }) })).toBe('auth|42');
    expect(displayNameOf({ ...session, idToken: 'not-a-token' })).toBe('auth|42');
    expect(
      displayNameOf({
        ...session,
        idToken: tokenWith([1, 2] as unknown as Record<string, unknown>),
      }),
    ).toBe('auth|42');
    expect(displayNameOf({ ...session, idToken: `a.${btoa('null')}.c` })).toBe('auth|42');
  });
});
