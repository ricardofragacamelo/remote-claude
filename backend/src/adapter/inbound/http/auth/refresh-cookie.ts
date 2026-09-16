import type { CookieOptions, Request, Response } from 'express';

/** Name of the cookie the refresh token lives in. */
export const REFRESH_COOKIE = 'rc_refresh';

/**
 * Where the refresh token lives, and why it lives there.
 *
 * `httpOnly` so no script can read it — `localStorage` would turn any XSS into a permanent
 * session for the attacker. `secure` unconditionally, including in development: browsers treat
 * `localhost` as a trustworthy origin, so there is no environment that needs the weaker cookie,
 * and a flag that is only on in production is a flag nobody ever tests. `sameSite: 'strict'` so
 * it never rides along on a cross-site request. Scoped to `/auth`, the only path that needs it.
 */
const OPTIONS: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' };

/** Writes the rotated refresh token, or clears the cookie when the provider issued none. */
export function writeRefreshCookie(response: Response, token: string | null): void {
  if (token === null) {
    response.clearCookie(REFRESH_COOKIE, OPTIONS);
    return;
  }

  response.cookie(REFRESH_COOKIE, token, OPTIONS);
}

/** The refresh token the browser sent, or `null`. */
export function readRefreshCookie(request: Request): string | null {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  const value = cookies?.[REFRESH_COOKIE];

  return value === undefined || value === '' ? null : value;
}
