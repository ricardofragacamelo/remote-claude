import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWK, CryptoKey } from 'jose';

/** The issuer every fixture uses, unless a test wants a different one. */
export const ISSUER = 'https://identity.test/realms/remote-claude';

/** The audience the backend is configured to require. */
export const AUDIENCE = 'https://api.remote-claude.local';

/** How a token can be bent out of shape, one claim at a time. */
export interface TokenOverrides {
  readonly subject?: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresAt?: Date;
  readonly notBefore?: Date;
  readonly keyId?: string;
}

/**
 * An identity provider, in process.
 *
 * Real keys and real signatures, no network and no tenant. A test that talks to an actual
 * provider is flaky by construction and welds the suite to a vendor —
 * docs/architecture/shared/08-authentication.md#testes.
 */
export class FakeIdentityProvider {
  private constructor(
    readonly keyId: string,
    private readonly privateKey: CryptoKey,
    private readonly publicJwk: JWK,
    private readonly wrongKey: CryptoKey,
  ) {}

  /**
   * RSA key generation costs hundreds of milliseconds, and every suite wants the same fixture.
   * Generated once per process and shared — the keys are a fixture, not the thing under test.
   */
  private static readonly cache = new Map<string, Promise<FakeIdentityProvider>>();

  static create(keyId = 'test-key-1'): Promise<FakeIdentityProvider> {
    const cached = FakeIdentityProvider.cache.get(keyId);
    if (cached !== undefined) {
      return cached;
    }

    const created = (async (): Promise<FakeIdentityProvider> => {
      const pair = await generateKeyPair('RS256', { extractable: true });
      const impostor = await generateKeyPair('RS256', { extractable: true });

      return new FakeIdentityProvider(
        keyId,
        pair.privateKey,
        { ...(await exportJWK(pair.publicKey)), kid: keyId, alg: 'RS256', use: 'sig' },
        impostor.privateKey,
      );
    })();

    FakeIdentityProvider.cache.set(keyId, created);
    return created;
  }

  /** The key set this provider publishes. */
  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  /** The metadata document at `.well-known/openid-configuration`. */
  discoveryDocument(issuer: string = ISSUER): Record<string, string> {
    return {
      issuer,
      jwks_uri: `${issuer}/protocol/openid-connect/certs`,
      token_endpoint: `${issuer}/protocol/openid-connect/token`,
      authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
    };
  }

  /** A signed access token, valid unless a test asks for it to be otherwise. */
  async accessToken(overrides: TokenOverrides = {}): Promise<string> {
    return this.sign(this.privateKey, overrides);
  }

  /** A token signed by a key this provider never published. */
  async forgedToken(overrides: TokenOverrides = {}): Promise<string> {
    return this.sign(this.wrongKey, overrides);
  }

  /** A properly signed token that carries no `sub`, which no claim-reading code may accept. */
  async subjectlessToken(): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.privateKey);
  }

  /** An unsigned token claiming `alg: none` — the classic attempt. */
  unsignedToken(subject = 'auth|42'): string {
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: subject,
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1_000) + 900,
    })}.`;
  }

  private async sign(key: CryptoKey, overrides: TokenOverrides): Promise<string> {
    const now = Math.floor(Date.now() / 1_000);
    const signer = new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: overrides.keyId ?? this.keyId })
      .setSubject(overrides.subject ?? 'auth|42')
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(
        overrides.expiresAt === undefined
          ? now + 900
          : Math.floor(overrides.expiresAt.getTime() / 1_000),
      );

    if (overrides.notBefore !== undefined) {
      signer.setNotBefore(Math.floor(overrides.notBefore.getTime() / 1_000));
    }

    return signer.sign(key);
  }
}
