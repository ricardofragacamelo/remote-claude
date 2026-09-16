import { Inject, Injectable } from '@nestjs/common';
import { decodeProtectedHeader, errors, jwtVerify } from 'jose';

import type { AccessTokenVerifier, VerifiedAccessToken } from '@application/auth';
import { TokenExpiredError, UnauthenticatedError } from '@domain/auth';
import { APP_CONFIG, type AppConfig } from '@infra/config/environment';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { IDENTITY_DISCOVERY, IDENTITY_JWKS } from './identity.tokens';
import type { JwksCache } from './jwks-cache';
import type { OidcDiscovery } from './oidc-discovery';

/**
 * The algorithms this backend accepts.
 *
 * The list is ours, and the token's own `alg` header is never consulted to decide it. Trusting
 * the token about how to verify the token is the classic JWT hole, and `none` is where it ends.
 */
const ALGORITHMS = ['RS256', 'ES256'];

/** Seconds of clock skew tolerated between us and the provider. */
const CLOCK_TOLERANCE = '60s';

/**
 * Validates an access token locally, against the issuer's key set.
 *
 * Local validation and not remote introspection: introspecting on every call would put the
 * provider on the critical path of every request this system serves.
 *
 * Failure is always `401`, and the response never says which step failed — only the log does.
 */
@Injectable()
export class OidcTokenVerifier implements AccessTokenVerifier {
  constructor(
    @Inject(IDENTITY_DISCOVERY) private readonly discovery: OidcDiscovery,
    @Inject(IDENTITY_JWKS) private readonly jwks: JwksCache,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async verify(token: string): Promise<VerifiedAccessToken> {
    try {
      return await this.check(token);
    } catch (error) {
      const failure = this.asDomainFailure(error);

      // The exact reason is logged and never returned: telling a caller which check failed tells
      // an attacker what to change. See docs/architecture/shared/08-authentication.md.
      this.logger.warn(
        {
          op: 'auth.verify',
          layer: 'adapter',
          module: 'auth',
          errorCode: failure.code,
          err: failure,
        },
        'access token rejected',
      );

      throw failure;
    }
  }

  private async check(token: string): Promise<VerifiedAccessToken> {
    const header = decodeProtectedHeader(token);

    if (header.alg === undefined || !ALGORITHMS.includes(header.alg)) {
      throw new UnauthenticatedError(`algorithm ${String(header.alg)} is not allowed`);
    }
    if (header.kid === undefined) {
      throw new UnauthenticatedError('token carries no key id');
    }

    const document = await this.discovery.document();
    const key = await this.jwks.keyFor(document.jwksUri, header.kid);

    const { payload } = await jwtVerify(token, key, {
      algorithms: ALGORITHMS,
      issuer: document.issuer,
      audience: this.config.oidc.audience,
      clockTolerance: CLOCK_TOLERANCE,
    });

    if (typeof payload.sub !== 'string' || payload.exp === undefined) {
      throw new UnauthenticatedError('token carries no subject or no expiry');
    }

    return { subject: payload.sub, expiresAt: new Date(payload.exp * 1_000) };
  }

  private asDomainFailure(error: unknown): TokenExpiredError | UnauthenticatedError {
    if (error instanceof TokenExpiredError || error instanceof UnauthenticatedError) {
      return error;
    }

    if (error instanceof errors.JWTExpired) {
      return new TokenExpiredError();
    }

    return new UnauthenticatedError(error instanceof Error ? error.message : 'verification failed');
  }
}
