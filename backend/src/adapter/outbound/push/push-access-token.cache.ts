import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';

import type { Clock } from '@domain/shared';
import { readTokenAnswer } from '@shared/http/token-endpoint';
import type { PushCredentials } from './push-credentials';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

/** How long before a token expires it is treated as expired. A clock skew is not a failure. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;

/** Algorithm of the assertion. Fixed, never read from the credential — that is the JWT hole. */
const ALGORITHM = 'RS256';

/** How long an assertion is valid for. Short: it is exchanged immediately and then thrown away. */
const ASSERTION_LIFETIME_SECONDS = 300;

/** The provider refused the exchange, or could not be reached to perform it. */
export class PushAuthorizationFailedError extends Error {
  constructor(reason: string) {
    super(`the push provider would not authorise this backend: ${reason}`);
    this.name = 'PushAuthorizationFailedError';
  }
}

/**
 * The access token the send endpoint wants, minted and then kept until it is nearly due.
 *
 * The exchange is a signed assertion for a bearer token — the standard the credential itself
 * describes, with the endpoint, the issuer and the key all coming out of the file. No name of a
 * vendor appears here, and none needs to.
 *
 * It is cached because a notification goes to every approved device of a user: exchanging once
 * per message would put a round trip in front of every one of them, in the one path that is
 * already racing a deadline.
 */
export class PushAccessTokenCache {
  private held: { token: string; expiresAt: number } | null = null;
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly scope: string,
    private readonly clock: Clock,
    private readonly http: typeof fetch = fetch,
  ) {}

  /**
   * A token that is good right now.
   *
   * Concurrent callers share one exchange: a fan-out to five devices must not mint five tokens,
   * and some providers count that as abuse.
   *
   * @throws {PushAuthorizationFailedError} when the exchange fails
   */
  async token(credentials: PushCredentials): Promise<string> {
    const now = this.clock.now().getTime();
    const held = this.held;

    if (held !== null && held.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
      return held.token;
    }

    this.inFlight ??= this.exchange(credentials).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  /** Drops what is held, so the next send mints a fresh one. For a `401` from the send call. */
  forget(): void {
    this.held = null;
  }

  private async exchange(credentials: PushCredentials): Promise<string> {
    const assertion = await this.sign(credentials);

    const response = await this.http(credentials.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    const granted = await readTokenAnswer(
      response,
      tokenResponseSchema,
      (why) => new PushAuthorizationFailedError(`the exchange ${why}`),
    );

    this.held = {
      token: granted.access_token,
      expiresAt: this.clock.now().getTime() + granted.expires_in * 1000,
    };

    return granted.access_token;
  }

  private async sign(credentials: PushCredentials): Promise<string> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);

    try {
      return await new SignJWT({ scope: this.scope })
        .setProtectedHeader({ alg: ALGORITHM })
        .setIssuer(credentials.issuer)
        .setSubject(credentials.issuer)
        .setAudience(credentials.tokenEndpoint)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ASSERTION_LIFETIME_SECONDS)
        .sign(await importPKCS8(credentials.privateKey, ALGORITHM));
    } catch {
      // The reason is deliberately not carried: whatever `jose` says about a private key it could
      // not read is a sentence with a private key's shape in it.
      throw new PushAuthorizationFailedError('the private key could not be used to sign');
    }
  }
}
