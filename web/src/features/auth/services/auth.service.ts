import { z } from 'zod';

import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { config } from '@/shared/config/env';
import { navigation } from '@/shared/lib/navigation';
import { logger } from '@/shared/logging/logger';
import { createPkcePair, randomToken } from './pkce';
import type { AuthSession, SessionDto } from '../types/session';

/** Where the provider sends the browser back. */
export const CALLBACK_PATH = '/callback';

/**
 * None of the calls in this file may be retried by renewing.
 *
 * They are what *produces* the credential, so there is nothing to renew with — and `/auth/refresh`
 * renewing itself is a promise waiting on itself, which shows up as a screen that never finishes
 * loading rather than as an error.
 */
const NOT_RENEWABLE = { renewable: false } as const;

/**
 * Keys of the handful of values that do live in `sessionStorage`.
 *
 * None of them is a credential. The verifier exists only between the redirect and the callback and
 * is deleted the moment it has been used; the token never goes near any storage at all.
 */
const VERIFIER_KEY = 'rc.pkce.verifier';
const STATE_KEY = 'rc.pkce.state';
const RETURN_KEY = 'rc.return';

const discoverySchema = z.object({
  authorization_endpoint: z.url(),
  end_session_endpoint: z.url().optional(),
});

/** The endpoints the browser itself needs. Discovered, never written by hand. */
export interface AuthorizationEndpoints {
  readonly authorizationEndpoint: string;
  readonly endSessionEndpoint: string | null;
}

/** @throws {AppError} when the provider cannot be read */
export async function discover(
  issuer: string = config.oidc.issuer,
  http: typeof fetch = fetch,
): Promise<AuthorizationEndpoints> {
  const response = await http(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  const parsed = discoverySchema.safeParse(response.ok ? await response.json() : null);

  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'common.error.unexpected', 'discovery');
  }

  return {
    authorizationEndpoint: parsed.data.authorization_endpoint,
    endSessionEndpoint: parsed.data.end_session_endpoint ?? null,
  };
}

/**
 * Starts the login and answers the URL to send the browser to.
 *
 * @param returnTo the route to come back to afterwards, so a deep link survives the round trip
 */
export async function beginLogin(
  returnTo: string,
  storage: Storage = sessionStorage,
  http: typeof fetch = fetch,
): Promise<string> {
  const { authorizationEndpoint } = await discover(config.oidc.issuer, http);
  const { verifier, challenge } = await createPkcePair();
  const state = randomToken(16);

  storage.setItem(VERIFIER_KEY, verifier);
  storage.setItem(STATE_KEY, state);
  storage.setItem(RETURN_KEY, returnTo);

  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.oidc.clientId,
    redirect_uri: redirectUri(),
    scope: config.oidc.scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  logger.info({ op: 'auth.login' }, 'starting the authorization code flow');
  return `${authorizationEndpoint}?${query.toString()}`;
}

/** Where the provider was told to come back to. */
export function redirectUri(): string {
  return `${navigation.origin()}${CALLBACK_PATH}`;
}

/** The route the login started from. */
export function returnRoute(storage: Storage = sessionStorage): string {
  return storage.getItem(RETURN_KEY) ?? '/';
}

/** The exchange **in flight**, keyed by its code, so one callback makes one request. */
let exchange: { code: string; session: Promise<AuthSession> } | null = null;

/**
 * Completes the login.
 *
 * `state` is checked **every time**. Without it the callback would accept a code issued for
 * somebody else's request, which is cross-site request forgery with a session at the end of it.
 *
 * Called again with the same code while the first call is still in flight, it answers that same
 * promise — the same dedup, and for the same reason, as `renewSession`. An authorization code is
 * single use and the validated `state` is consumed by the first call, so React's development
 * double-effect would otherwise turn a login that worked into an error on screen. The memo lasts
 * only as long as the request: remembering a settled exchange would hand a later caller a session
 * it never asked for.
 *
 * @throws {AppError} when `state` does not match, or the exchange fails
 */
export async function completeLogin(
  params: URLSearchParams,
  storage: Storage = sessionStorage,
): Promise<AuthSession> {
  const code = params.get('code');

  if (code !== null && exchange?.code === code) {
    return exchange.session;
  }

  const expected = storage.getItem(STATE_KEY);
  const verifier = storage.getItem(VERIFIER_KEY);

  // Used once, then gone — whichever way this turns out.
  storage.removeItem(STATE_KEY);
  storage.removeItem(VERIFIER_KEY);

  const state = params.get('state');

  if (expected === null || state !== expected || verifier === null || code === null) {
    logger.warn({ op: 'auth.callback' }, 'state did not match the request');
    throw new AppError('UNAUTHENTICATED', 'auth.error.invalidState', 'callback');
  }

  const session = api
    .post<SessionDto>(
      '/auth/session',
      { code, codeVerifier: verifier, redirectUri: redirectUri() },
      NOT_RENEWABLE,
    )
    .then(toSession)
    .finally(() => {
      exchange = null;
    });

  exchange = { code, session };
  return session;
}

/** In-flight renewal, so N callers make one request. */
let renewal: Promise<AuthSession> | null = null;

/**
 * Renews the credential.
 *
 * Deduplicated on purpose: refresh tokens rotate, and a provider that sees the same one used twice
 * treats it as a leak and revokes the whole family. Several requests noticing an expiry at the same
 * moment must therefore become one call.
 */
export async function renewSession(): Promise<AuthSession> {
  renewal ??= api
    .post<SessionDto>('/auth/refresh', undefined, NOT_RENEWABLE)
    .then(toSession)
    .finally(() => {
      renewal = null;
    });

  return renewal;
}

/** Drops the refresh cookie. Ending the session at the provider is the caller's next step. */
export async function endSession(): Promise<void> {
  await api.post<void>('/auth/logout', undefined, NOT_RENEWABLE);
}

function toSession(dto: SessionDto): AuthSession {
  return {
    accessToken: dto.accessToken,
    userId: dto.userId,
    expiresAt: Date.now() + dto.expiresInSeconds * 1_000,
  };
}
