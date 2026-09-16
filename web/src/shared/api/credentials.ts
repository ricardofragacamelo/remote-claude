import type { Credentials } from './api';

/**
 * The credential, held for the transport layer.
 *
 * `shared/` never imports `features/` — the arrow points the other way, always — so the sign-in
 * feature pushes the token in here instead of the transport reaching into it. The token lives in a
 * module variable, in memory: it dies with the tab, and no script can persist it.
 */
let accessToken: string | null = null;
let locale = 'en';
let renewer: (() => Promise<string | null>) | null = null;

/** Called by the auth feature whenever the session changes. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when the connection's language changes. */
export function setLocale(next: string): void {
  locale = next;
}

/** Wires renewal in, without the transport knowing what a refresh token is. */
export function setRenewer(renew: (() => Promise<string | null>) | null): void {
  renewer = renew;
}

/** The language of this client, for `Accept-Language` and for the handshake. */
export function currentLocale(): string {
  return locale;
}

/** What `api.ts` and `wsClient` read. */
export const credentials: Credentials = {
  accessToken: () => accessToken,
  renew: async () => (renewer === null ? null : renewer()),
};
