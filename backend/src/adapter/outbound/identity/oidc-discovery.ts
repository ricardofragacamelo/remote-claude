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
 * `${issuer}/.well-known/openid-configuration`, cached and revalidated.
 *
 * Endpoints are discovered, never written by hand: that is precisely what makes changing provider
 * a change of one environment variable. No code here — and none anywhere else — knows the name of
 * the provider. See docs/architecture/shared/08-authentication.md#discovery.
 *
 * **A revalidation that fails keeps the last good document** (S-70). The endpoints of a provider do
 * not move between one hour and the next, while the provider being unreachable for a minute is
 * ordinary — refusing every request of that minute because a document we already hold could not be
 * reread would turn a blip at the provider into an outage here. The failure is logged by whoever
 * calls, and the next call tries again. The very first read has nothing to fall back on, and fails.
 */
export class OidcDiscovery {
  private cached: { document: DiscoveryDocument; fetchedAt: number } | null = null;

  /** The read in flight, shared by every caller that arrives while it is on its way (S-71). */
  private reading: Promise<DiscoveryDocument> | null = null;

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

    this.reading ??= this.revalidate(now).finally(() => {
      this.reading = null;
    });

    return this.reading;
  }

  private async revalidate(now: number): Promise<DiscoveryDocument> {
    try {
      const document = await this.fetchDocument();
      this.cached = { document, fetchedAt: now };
      return document;
    } catch (error) {
      if (this.cached === null) {
        throw error;
      }

      return this.cached.document;
    }
  }

  private async fetchDocument(): Promise<DiscoveryDocument> {
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

    return {
      issuer: parsed.data.issuer,
      jwksUri: parsed.data.jwks_uri,
      tokenEndpoint: parsed.data.token_endpoint,
      authorizationEndpoint: parsed.data.authorization_endpoint,
    };
  }
}
