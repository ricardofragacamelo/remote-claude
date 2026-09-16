import { create } from 'zustand';

import type { AuthSession } from '../types/session';

/** Where the sign-in is. `unknown` is the state before the first renewal has been tried. */
export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface AuthState {
  readonly status: AuthStatus;

  /**
   * The access token, **in memory**.
   *
   * Never `localStorage`: anything a script on the page can read, an XSS can read, and a stolen
   * access token in storage is a session that outlives the tab. This one dies with it — and the
   * refresh token, which does survive, lives in a cookie no script can reach.
   */
  readonly session: AuthSession | null;

  signedIn(session: AuthSession): void;
  signedOut(): void;
}

/** The proportion of a token's life after which renewal starts. */
export const RENEW_AT = 0.8;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  session: null,
  signedIn: (session) => set({ status: 'authenticated', session }),
  signedOut: () => set({ status: 'anonymous', session: null }),
}));

/** When to renew a session, as a delay in milliseconds from now. Never negative. */
export function renewalDelay(session: AuthSession, now: number = Date.now()): number {
  const lifetime = session.expiresAt - now;
  return Math.max(0, Math.round(lifetime * RENEW_AT));
}
