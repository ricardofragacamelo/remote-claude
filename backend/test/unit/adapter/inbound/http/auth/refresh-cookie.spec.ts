import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import {
  readRefreshCookie,
  REFRESH_COOKIE,
  writeRefreshCookie,
} from '@adapter/inbound/http/auth/refresh-cookie';

/** A response that records the cookie calls it received. */
function recordingResponse(): Response & {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
} {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('writeRefreshCookie', () => {
  it('writes the token where no script can read it', () => {
    const response = recordingResponse();

    writeRefreshCookie(response, 'r1');

    expect(response.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'r1', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
    });
  });

  it('clears the cookie when the provider issued no refresh token', () => {
    const response = recordingResponse();

    writeRefreshCookie(response, null);

    expect(response.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.anything());
    expect(response.cookie).not.toHaveBeenCalled();
  });
});

describe('readRefreshCookie', () => {
  it('reads the token the browser sent', () => {
    const request = { cookies: { [REFRESH_COOKIE]: 'r1' } } as unknown as Request;

    expect(readRefreshCookie(request)).toBe('r1');
  });

  it.each([
    ['there are no cookies at all', {}],
    ['the cookie is absent', { cookies: {} }],
    ['the cookie is empty', { cookies: { [REFRESH_COOKIE]: '' } }],
  ])('answers null when %s', (_case, request) => {
    expect(readRefreshCookie(request as unknown as Request)).toBeNull();
  });
});
