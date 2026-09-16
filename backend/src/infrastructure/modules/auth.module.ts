import { Module } from '@nestjs/common';

import {
  ACCESS_TOKEN_VERIFIER,
  AuthenticateUseCase,
  EstablishSessionUseCase,
  IDENTITY_PROVIDER,
  RenewSessionUseCase,
} from '@application/auth';
import type { AccessTokenVerifier, IdentityProvider } from '@application/auth';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { AuthController } from '@adapter/inbound/http/auth/auth.controller';
import { IDENTITY_DISCOVERY, IDENTITY_JWKS } from '@adapter/outbound/identity/identity.tokens';
import { JwksCache } from '@adapter/outbound/identity/jwks-cache';
import { OidcDiscovery } from '@adapter/outbound/identity/oidc-discovery';
import { OidcIdentityProvider } from '@adapter/outbound/identity/oidc-identity-provider.adapter';
import { OidcTokenVerifier } from '@adapter/outbound/identity/oidc-token-verifier.adapter';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';

/**
 * Identity.
 *
 * Every use case is built with `new` in a factory. It is three extra lines each, and it is what
 * keeps `application/` free of decorators — which is what lets its tests run without a container.
 */
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: IDENTITY_DISCOVERY,
      inject: [APP_CONFIG, CLOCK],
      useFactory: (config: AppConfig, clock: Clock) => new OidcDiscovery(config.oidc.issuer, clock),
    },
    {
      provide: IDENTITY_JWKS,
      inject: [CLOCK],
      useFactory: (clock: Clock) => new JwksCache(clock),
    },
    { provide: ACCESS_TOKEN_VERIFIER, useClass: OidcTokenVerifier },
    { provide: IDENTITY_PROVIDER, useClass: OidcIdentityProvider },
    {
      provide: AuthenticateUseCase,
      inject: [ACCESS_TOKEN_VERIFIER],
      useFactory: (verifier: AccessTokenVerifier) => new AuthenticateUseCase(verifier),
    },
    {
      provide: EstablishSessionUseCase,
      inject: [IDENTITY_PROVIDER, AuthenticateUseCase],
      useFactory: (provider: IdentityProvider, authenticate: AuthenticateUseCase) =>
        new EstablishSessionUseCase(provider, authenticate),
    },
    {
      provide: RenewSessionUseCase,
      inject: [IDENTITY_PROVIDER, AuthenticateUseCase],
      useFactory: (provider: IdentityProvider, authenticate: AuthenticateUseCase) =>
        new RenewSessionUseCase(provider, authenticate),
    },
  ],
  exports: [AuthenticateUseCase],
})
export class AuthModule {}
