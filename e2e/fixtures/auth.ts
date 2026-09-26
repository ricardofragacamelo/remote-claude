import { createHash, randomBytes } from 'node:crypto';

import type { Browser, Page } from '@playwright/test';

import { environment } from './environment';
import type { ScenarioUser } from '../scenarios';

/**
 * Signing in, through the door a user goes through.
 *
 * Nothing here knows the provider's name, and nothing here mints a token: the browser walks the
 * authorization code flow with PKCE against the local Keycloak, and the **backend** is what
 * exchanges the code. That is the whole of docs/architecture/shared/08-authentication.md, proved
 * once, at the only level where the redirect, the login form and the cookie all exist.
 */

/** Where the provider sends the browser back — the same route the application registers. */
export const CALLBACK_PATH = '/callback';

/** A PKCE pair: the secret and the digest of it that travels in the open. */
export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** Builds a PKCE pair, as RFC 7636 defines it. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/** The authorization request, as the application builds it. */
export function authorizationUrl(challenge: string, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: environment.clientId,
    redirect_uri: `${environment.webUrl}${CALLBACK_PATH}`,
    scope: 'openid profile email offline_access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return `${environment.issuer}/protocol/openid-connect/auth?${query.toString()}`;
}

/** Fills the provider's login form and submits it. */
export async function submitCredentials(page: Page, user: ScenarioUser): Promise<void> {
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
}

/**
 * Opens `path` in the browser signed out, signs in from the screen's own button, and waits to be
 * brought back to that same address — a deep link that did not survive the round trip fails here.
 *
 * @param path the route with its search, as a person would paste it
 */
export async function openSignedIn(page: Page, user: ScenarioUser, path: string): Promise<void> {
  await page.goto(path);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${environment.keycloakUrl}/**`);
  await submitCredentials(page, user);
  await page.waitForURL(`${environment.webUrl}${path}`);
}

/** What a completed sign-in gives the caller. */
export interface AuthenticatedUser {
  readonly accessToken: string;
  readonly userId: string;
}

/**
 * Walks the whole flow in a throwaway browser context and answers a usable credential.
 *
 * The callback navigation is intercepted rather than followed: an authorization code is single
 * use, and letting the application consume it would leave this caller with nothing. What happens
 * when the application *does* consume it is the subject of the UI spec, not of this helper.
 *
 * @throws {Error} when the provider comes back without a code, or the exchange is refused
 */
export async function signIn(browser: Browser, user: ScenarioUser): Promise<AuthenticatedUser> {
  const context = await browser.newContext();
  const page = await context.newPage();

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('base64url');

  let callbackUrl: string | null = null;
  await page.route(`${environment.webUrl}${CALLBACK_PATH}*`, async (route) => {
    callbackUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
  });

  await page.goto(authorizationUrl(challenge, state));
  await submitCredentials(page, user);
  await page.waitForURL(`${environment.webUrl}${CALLBACK_PATH}*`);

  const returned = new URL(callbackUrl ?? page.url());
  const code = returned.searchParams.get('code');

  if (returned.searchParams.get('state') !== state || code === null) {
    await context.close();
    throw new Error(`the provider came back without a usable code: ${returned.search}`);
  }

  const response = await context.request.post(`${environment.backendUrl}/auth/session`, {
    data: { code, codeVerifier: verifier, redirectUri: `${environment.webUrl}${CALLBACK_PATH}` },
  });

  if (response.status() !== 201) {
    const body = await response.text();
    await context.close();
    throw new Error(`the backend refused the exchange with ${String(response.status())}: ${body}`);
  }

  const session = (await response.json()) as { accessToken: string; userId: string };
  await context.close();

  return { accessToken: session.accessToken, userId: session.userId };
}
