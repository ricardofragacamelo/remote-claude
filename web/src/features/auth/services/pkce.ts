/**
 * Proof Key for Code Exchange.
 *
 * A single-page application is a **public** client: everything in the bundle is readable, so there
 * is no client secret to prove with. PKCE is what replaces it — the app proves that the code being
 * exchanged is the one it asked for. See docs/architecture/shared/08-authentication.md.
 */

/** RFC 7636 puts the verifier between 43 and 128 characters; 32 random bytes lands at 43. */
const VERIFIER_BYTES = 32;

/** Random bytes, base64url — the alphabet every OIDC parameter is allowed to use. */
export function randomToken(bytes = VERIFIER_BYTES): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** The verifier the app keeps, and the challenge it publishes. */
export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/**
 * A verifier and its S256 challenge.
 *
 * `S256`, never `plain`: a plain challenge is the verifier, and anyone who can read the
 * authorization request can then redeem the code.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomToken();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));

  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
