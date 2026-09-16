import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AuthorizationCodeExchange, IdentityProvider, IssuedTokens } from '@application/auth';
import { UnauthenticatedError } from '@domain/auth';
import { APP_CONFIG, type AppConfig } from '@infra/config/environment';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { IDENTITY_DISCOVERY } from './identity.tokens';
import type { OidcDiscovery } from './oidc-discovery';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
});

/**
 * The token endpoint of the provider, reached on behalf of a browser.
 *
 * The browser never performs this exchange itself, for one reason: the refresh token has to land
 * in a cookie the browser's own scripts cannot read, and only a server can set one.
 * See docs/architecture/web/07-auth.md.
 */
@Injectable()
export class OidcIdentityProvider implements IdentityProvider {
  constructor(
    @Inject(IDENTITY_DISCOVERY) private readonly discovery: OidcDiscovery,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async exchangeAuthorizationCode(input: AuthorizationCodeExchange): Promise<IssuedTokens> {
    return this.post('auth.exchange', {
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: this.config.oidc.webClientId,
    });
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.post('auth.refresh', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.oidc.webClientId,
    });
  }

  private async post(op: string, form: Record<string, string>): Promise<IssuedTokens> {
    const { tokenEndpoint } = await this.discovery.document();
    const startedAt = Date.now();

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });

    // Neither the form nor the body is logged: both carry the credential itself.
    this.logger.debug(
      {
        op,
        layer: 'adapter',
        module: 'auth',
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
      },
      'identity provider answered',
    );

    if (!response.ok) {
      throw new UnauthenticatedError(`token endpoint answered ${String(response.status)}`);
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new UnauthenticatedError('token endpoint answered an unusable body');
    }

    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? null,
      expiresInSeconds: parsed.data.expires_in,
    };
  }
}
