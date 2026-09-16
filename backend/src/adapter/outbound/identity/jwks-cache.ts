import { importJWK } from 'jose';
import type { CryptoKey, JWK } from 'jose';

import { UnauthenticatedError } from '@domain/auth';
import type { Clock } from '@domain/shared';

/**
 * How long to wait before fetching the key set again after a miss.
 *
 * Without a cooldown, a stream of tokens carrying an unknown `kid` becomes a stream of requests to
 * the provider — an amplifier anyone can aim at it.
 */
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * The signing keys of the issuer, cached and reloaded when a key is unknown.
 *
 * Providers rotate keys without announcing it, so an unknown `kid` is a reason to refetch once —
 * and, if it is still unknown, a reason to refuse. See docs/architecture/shared/08-authentication.md.
 */
export class JwksCache {
  private keys: readonly JWK[] = [];
  private fetchedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly clock: Clock,
    private readonly http: typeof fetch = fetch,
  ) {}

  /**
   * The key that signed a token.
   *
   * @throws {UnauthenticatedError} when the key set cannot be read, or has no such key
   */
  async keyFor(jwksUri: string, kid: string): Promise<CryptoKey | Uint8Array> {
    const found = this.keys.find((key) => key.kid === kid);
    if (found !== undefined) {
      return importJWK(found);
    }

    const now = this.clock.now().getTime();
    if (now - this.fetchedAt < RELOAD_COOLDOWN_MS) {
      throw new UnauthenticatedError(`unknown key id, and the key set was just reloaded`);
    }

    await this.reload(jwksUri, now);

    const reloaded = this.keys.find((key) => key.kid === kid);
    if (reloaded === undefined) {
      throw new UnauthenticatedError('unknown key id after reloading the key set');
    }

    return importJWK(reloaded);
  }

  private async reload(jwksUri: string, now: number): Promise<void> {
    this.fetchedAt = now;

    const response = await this.http(jwksUri);
    if (!response.ok) {
      throw new UnauthenticatedError(`jwks endpoint answered ${String(response.status)}`);
    }

    const body = (await response.json()) as { keys?: unknown };
    this.keys = Array.isArray(body.keys) ? (body.keys as JWK[]) : [];
  }
}
