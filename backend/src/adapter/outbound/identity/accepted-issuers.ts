import { UnauthenticatedError } from '@domain/auth';
import type { Clock } from '@domain/shared';
import { JwksCache } from './jwks-cache';
import { OidcDiscovery } from './oidc-discovery';

/** One issuer this backend accepts tokens from, with its own discovery and its own key set. */
export interface AcceptedIssuer {
  readonly issuer: string;
  readonly discovery: OidcDiscovery;
  readonly jwks: JwksCache;
}

/** The same issuer written with and without its trailing slash is the same issuer. */
function withoutTrailingSlash(issuer: string): string {
  return issuer.replace(/\/$/, '');
}

/**
 * The explicit list of issuers whose tokens are accepted — ADR-021.
 *
 * One realm can be reached through more than one origin — the provider's own port, and the web
 * server that forwards `/realms` — and the provider writes into `iss` the origin it was called
 * through. Each origin is therefore an issuer of its own, and each gets **its own** discovery and
 * **its own** key set: the read in flight is shared per issuer, and a revalidation that fails keeps
 * the last good document of that issuer without touching any other.
 *
 * The token's unverified `iss` only **chooses** among the configured issuers; it never adds one.
 * The signature is then checked against the chosen issuer's keys, and `iss` compared byte for byte
 * with what that issuer's discovery declares — so a forged `iss` buys nothing.
 *
 * The first issuer is the primary one: the issuer the web signs in with, whose token endpoint the
 * backend calls on the browser's behalf.
 */
export class AcceptedIssuers {
  readonly primary: AcceptedIssuer;
  private readonly byIssuer: ReadonlyMap<string, AcceptedIssuer>;

  /**
   * @param issuers the configuration's list, primary first — validated at boot, never empty
   * @throws {Error} when the list is empty, which the configuration schema already refuses
   */
  constructor(issuers: readonly string[], clock: Clock, http: typeof fetch = fetch) {
    const accepted = issuers.map((issuer) => ({
      issuer,
      discovery: new OidcDiscovery(issuer, clock, http),
      jwks: new JwksCache(clock, http),
    }));

    const [primary] = accepted;
    if (primary === undefined) {
      throw new Error('at least one issuer has to be accepted');
    }

    this.primary = primary;
    this.byIssuer = new Map(accepted.map((entry) => [withoutTrailingSlash(entry.issuer), entry]));
  }

  /**
   * The accepted issuer a token claims to come from.
   *
   * @param claimed the token's `iss`, not verified yet
   * @throws {UnauthenticatedError} when the token names no issuer of the list
   */
  of(claimed: unknown): AcceptedIssuer {
    const found =
      typeof claimed === 'string' ? this.byIssuer.get(withoutTrailingSlash(claimed)) : undefined;

    if (found === undefined) {
      throw new UnauthenticatedError('token "iss" claim is not an accepted issuer');
    }

    return found;
  }
}
