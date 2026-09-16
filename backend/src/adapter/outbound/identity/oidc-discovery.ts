import { z } from 'zod';

import { UnauthenticatedError } from '@domain/auth';
import type { Clock } from '@domain/shared';

const documentSchema = z.object({
  issuer: z.string().min(1),
  jwks_uri: z.url(),
  token_endpoint: z.url(),
  authorization_endpoint: z.url(),
});

/** What the backend needs from the provider's metadata. */
export interface DiscoveryDocument {
  readonly issuer: string;
  readonly jwksUri: string;
  readonly tokenEndpoint: string;
  readonly authorizationEndpoint: string;
}

/** How long a discovery document is trusted before it is fetched again. */
const TTL_MS = 3_600_000;

/**
 * `${issuer}/.well-known/openid-configuration`, cached.
 *
 * Endpoints are discovered, never written by hand: that is precisely what makes changing provider
 * a change of one environment variable. No code here — and none anywhere else — knows the name of
 * the provider. See docs/architecture/shared/08-authentication.md#discovery.
 */
export class OidcDiscovery {
  private cached: { document: DiscoveryDocument; fetchedAt: number } | null = null;

  constructor(
    private readonly issuer: string,
    private readonly clock: Clock,
    private readonly http: typeof fetch = fetch,
  ) {}

  /** @throws {UnauthenticatedError} when the provider is unreachable or answers nonsense */
  async document(): Promise<DiscoveryDocument> {
    const now = this.clock.now().getTime();

    if (this.cached !== null && now - this.cached.fetchedAt < TTL_MS) {
      return this.cached.document;
    }

    const url = `${this.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const response = await this.http(url);

    if (!response.ok) {
      throw new UnauthenticatedError(`discovery answered ${String(response.status)}`);
    }

    const parsed = documentSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new UnauthenticatedError('discovery document is missing required endpoints');
    }

    // The document says who issued it. If that disagrees with the issuer we were configured with,
    // we are talking to the wrong provider — and every token it signs would be the wrong one.
    if (parsed.data.issuer.replace(/\/$/, '') !== this.issuer.replace(/\/$/, '')) {
      throw new UnauthenticatedError('discovery document declares a different issuer');
    }

    const document: DiscoveryDocument = {
      issuer: parsed.data.issuer,
      jwksUri: parsed.data.jwks_uri,
      tokenEndpoint: parsed.data.token_endpoint,
      authorizationEndpoint: parsed.data.authorization_endpoint,
    };

    this.cached = { document, fetchedAt: now };
    return document;
  }
}
