import { Module } from '@nestjs/common';

import {
  ACCESS_TOKEN_VERIFIER,
  ApproveDeviceUseCase,
  AuthenticateUseCase,
  DEVICE_CONNECTIONS,
  DEVICE_CONTEXT,
  DEVICE_REPOSITORY,
  EstablishSessionUseCase,
  ExpirePendingDevicesUseCase,
  ForgetPushTokenUseCase,
  IDENTITY_PROVIDER,
  ListApprovedDevicesUseCase,
  ListDevicesUseCase,
  RegisterDeviceUseCase,
  RenewSessionUseCase,
  ResolveDeviceUseCase,
  RevokeDeviceUseCase,
} from '@application/auth';
import type {
  AccessTokenVerifier,
  DeviceConnections,
  DeviceContext,
  DeviceRepository,
  IdentityProvider,
} from '@application/auth';
import { RecordAuditEventUseCase } from '@application/audit';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { AuthController } from '@adapter/inbound/http/auth/auth.controller';
import { DevicesController } from '@adapter/inbound/http/devices/devices.controller';
import { RegistryDeviceConnections } from '@adapter/outbound/auth/registry-device-connections';
import { IDENTITY_DISCOVERY, IDENTITY_JWKS } from '@adapter/outbound/identity/identity.tokens';
import { JwksCache } from '@adapter/outbound/identity/jwks-cache';
import { OidcDiscovery } from '@adapter/outbound/identity/oidc-discovery';
import { OidcIdentityProvider } from '@adapter/outbound/identity/oidc-identity-provider.adapter';
import { OidcTokenVerifier } from '@adapter/outbound/identity/oidc-token-verifier.adapter';
import { DrizzleDeviceRepository } from '@adapter/outbound/persistence/auth/drizzle-device.repository';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { DeviceExpiryJob } from '../jobs/device-expiry.job';
import { AuditModule } from './audit.module';
import { WebsocketModule } from './websocket.module';

/**
 * Identity: who the caller is, and which of their devices may decide something.
 *
 * Every use case is built with `new` in a factory. It is three extra lines each, and it is what
 * keeps `application/` free of decorators — which is what lets its tests run without a container.
 *
 * It imports `WebsocketModule` for one reason, and the reason is the whole point of B-04: revoking
 * a device has to close the sockets that device already has open. Nothing points back — the
 * transport knows nothing about devices — so there is no cycle.
 */
@Module({
  imports: [AuditModule, WebsocketModule],
  controllers: [AuthController, DevicesController],
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
    { provide: DEVICE_REPOSITORY, useClass: DrizzleDeviceRepository },
    { provide: DEVICE_CONNECTIONS, useClass: RegistryDeviceConnections },
    {
      // The three things every device use case needs, bundled once — the same reason
      // `PersistenceContext` exists for the repositories.
      provide: DEVICE_CONTEXT,
      inject: [DEVICE_REPOSITORY, RecordAuditEventUseCase, CLOCK],
      useFactory: (
        devices: DeviceRepository,
        trail: RecordAuditEventUseCase,
        clock: Clock,
      ): DeviceContext => ({ devices, trail, clock }),
    },
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
    {
      provide: RegisterDeviceUseCase,
      inject: [DEVICE_CONTEXT, ID_GENERATOR],
      useFactory: (context: DeviceContext, ids: IdGenerator) =>
        new RegisterDeviceUseCase(context, ids),
    },
    {
      provide: ListDevicesUseCase,
      inject: [DEVICE_REPOSITORY],
      useFactory: (devices: DeviceRepository) => new ListDevicesUseCase(devices),
    },
    {
      provide: ApproveDeviceUseCase,
      inject: [DEVICE_CONTEXT],
      useFactory: (context: DeviceContext) => new ApproveDeviceUseCase(context),
    },
    {
      provide: RevokeDeviceUseCase,
      inject: [DEVICE_CONTEXT, DEVICE_CONNECTIONS],
      useFactory: (context: DeviceContext, connections: DeviceConnections) =>
        new RevokeDeviceUseCase(context, connections),
    },
    {
      provide: ResolveDeviceUseCase,
      inject: [DEVICE_REPOSITORY],
      useFactory: (devices: DeviceRepository) => new ResolveDeviceUseCase(devices),
    },
    {
      provide: ExpirePendingDevicesUseCase,
      inject: [DEVICE_CONTEXT],
      useFactory: (context: DeviceContext) => new ExpirePendingDevicesUseCase(context),
    },
    {
      provide: ListApprovedDevicesUseCase,
      inject: [DEVICE_CONTEXT],
      useFactory: (context: DeviceContext) => new ListApprovedDevicesUseCase(context),
    },
    {
      provide: ForgetPushTokenUseCase,
      inject: [DEVICE_CONTEXT],
      useFactory: (context: DeviceContext) => new ForgetPushTokenUseCase(context),
    },
    DeviceExpiryJob,
  ],
  exports: [
    AuthenticateUseCase,
    ResolveDeviceUseCase,
    ExpirePendingDevicesUseCase,
    // For `notification`, which asks `auth` a question rather than reading its table.
    ListApprovedDevicesUseCase,
    ForgetPushTokenUseCase,
  ],
})
export class AuthModule {}
