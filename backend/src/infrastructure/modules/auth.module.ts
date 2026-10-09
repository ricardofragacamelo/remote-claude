import { Module } from '@nestjs/common';

import {
  ACCESS_TOKEN_VERIFIER,
  ApproveDeviceUseCase,
  AuthenticateUseCase,
  DEVICE_CONNECTIONS,
  DEVICE_EVENTS,
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
  AuthorizeFolderReadUseCase,
  RevokeDeviceUseCase,
} from '@application/auth';
import type {
  AccessTokenVerifier,
  DeviceConnections,
  DeviceEvents,
  DeviceContext,
  DeviceRepository,
  IdentityProvider,
} from '@application/auth';
import { RecordAuditEventUseCase } from '@application/audit';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { AuthController } from '@adapter/inbound/http/auth/auth.controller';
import { DevicesController } from '@adapter/inbound/http/devices/devices.controller';
import { EmitterDeviceEvents } from '@adapter/outbound/auth/emitter-device.events';
import { RegistryDeviceConnections } from '@adapter/outbound/auth/registry-device-connections';
import { AcceptedIssuers } from '@adapter/outbound/identity/accepted-issuers';
import { IDENTITY_DISCOVERY, IDENTITY_ISSUERS } from '@adapter/outbound/identity/identity.tokens';
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
      // Every accepted issuer, each with its own discovery and key set (ADR-021).
      provide: IDENTITY_ISSUERS,
      inject: [APP_CONFIG, CLOCK],
      useFactory: (config: AppConfig, clock: Clock) =>
        new AcceptedIssuers(config.oidc.issuers, clock),
    },
    {
      // The primary issuer's discovery — the same instance the verifier reads, so the token
      // endpoint of the web's exchange shares its cache and its read in flight.
      provide: IDENTITY_DISCOVERY,
      inject: [IDENTITY_ISSUERS],
      useFactory: (issuers: AcceptedIssuers) => issuers.primary.discovery,
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
      inject: [IDENTITY_PROVIDER, AuthenticateUseCase, CLOCK],
      useFactory: (provider: IdentityProvider, authenticate: AuthenticateUseCase, clock: Clock) =>
        new RenewSessionUseCase(provider, authenticate, clock),
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
      inject: [DEVICE_CONTEXT, DEVICE_EVENTS],
      useFactory: (context: DeviceContext, events: DeviceEvents) =>
        new ApproveDeviceUseCase(context, events),
    },
    // Who tells the phone it was approved is `notification`'s business, over the bus (plan 17, F3).
    { provide: DEVICE_EVENTS, useClass: EmitterDeviceEvents },
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
      // Only the web's own client reads the folder without a device (plan 25, D-12, D-24).
      provide: AuthorizeFolderReadUseCase,
      inject: [ResolveDeviceUseCase, APP_CONFIG],
      useFactory: (devices: ResolveDeviceUseCase, config: AppConfig) =>
        new AuthorizeFolderReadUseCase(devices, config.oidc.webClientId),
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
    // For `files`, whose every route asks it (plan 25, B-32).
    AuthorizeFolderReadUseCase,
    ExpirePendingDevicesUseCase,
    // For `notification`, which asks `auth` a question rather than reading its table.
    ListApprovedDevicesUseCase,
    ForgetPushTokenUseCase,
  ],
})
export class AuthModule {}
