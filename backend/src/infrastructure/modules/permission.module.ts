import { Module } from '@nestjs/common';

import {
  EndSessionPermissionsUseCase,
  ExtendPermissionUseCase,
  PERMISSION_BROADCASTER,
  PERMISSION_EVENTS,
  PERMISSION_REQUEST_REPOSITORY,
  PermissionDeadlines,
  PermissionRegistry,
  PermissionSettlement,
  RequestPermissionUseCase,
  ResolvePermissionUseCase,
} from '@application/permission';
import type {
  PermissionBroadcaster,
  PermissionEvents,
  PermissionRequestRepository,
  PermissionSettings,
} from '@application/permission';
import { CLOCK, ID_GENERATOR, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { SessionId } from '@domain/session';
import type { Clock, IdGenerator } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { ContractCommandHandler } from '@adapter/inbound/ws/contract-command.gateway-handler';
import {
  PERMISSION_HANDLERS,
  permissionSchemas,
} from '@adapter/inbound/ws/permission/permission-commands';
import { EmitterPermissionEvents } from '@adapter/outbound/permission/emitter-permission.events';
import { HubPermissionBroadcaster } from '@adapter/outbound/permission/hub-permission.broadcaster';
import { DrizzlePermissionRequestRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-request.repository';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { WebsocketModule } from './websocket.module';

/** DI token of the four numbers a request lives by. They are configuration, never a client's. */
export const PERMISSION_SETTINGS = Symbol('PermissionSettings');

/**
 * The `permission` module: the fence of the product, across all four layers.
 *
 * The registry is a singleton with the process, like the session registry and for the same reason:
 * an open request is a promise the SDK is holding its loop for, and none of that survives a
 * restart.
 *
 * It knows nothing about `session`, deliberately. The bridge that turns `canUseTool` into a
 * question lives on the session side and depends on this module; the arrow points one way, so
 * neither has to be built to test the other
 * (docs/architecture/backend/03-modules.md#fronteiras).
 */
@Module({
  imports: [WebsocketModule],
  providers: [
    {
      provide: PERMISSION_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.permission,
    },
    { provide: PERMISSION_REQUEST_REPOSITORY, useClass: DrizzlePermissionRequestRepository },
    { provide: PERMISSION_BROADCASTER, useClass: HubPermissionBroadcaster },
    { provide: PERMISSION_EVENTS, useClass: EmitterPermissionEvents },
    { provide: PermissionRegistry, useFactory: () => new PermissionRegistry() },
    {
      provide: PermissionSettlement,
      inject: [
        PermissionRegistry,
        PERMISSION_REQUEST_REPOSITORY,
        PERMISSION_BROADCASTER,
        PERMISSION_EVENTS,
        ID_GENERATOR,
        PERMISSION_SETTINGS,
      ],
      useFactory: (
        registry: PermissionRegistry,
        requests: PermissionRequestRepository,
        broadcaster: PermissionBroadcaster,
        events: PermissionEvents,
        ids: IdGenerator,
        settings: PermissionSettings,
      ) => new PermissionSettlement(registry, requests, broadcaster, events, ids, settings),
    },
    {
      provide: PermissionDeadlines,
      inject: [PermissionRegistry, PermissionSettlement, SCHEDULER, CLOCK, LOGGER],
      useFactory: (
        registry: PermissionRegistry,
        settlement: PermissionSettlement,
        scheduler: Scheduler,
        clock: Clock,
        logger: Logger,
      ) =>
        new PermissionDeadlines(registry, settlement, scheduler, clock, (error, requestId) => {
          logger.error(
            { op: 'permission.resolve', layer: 'application', requestId, err: error },
            'the deadline could not refuse a request nobody answered',
          );
        }),
    },
    {
      provide: RequestPermissionUseCase,
      inject: [
        PermissionRegistry,
        PERMISSION_REQUEST_REPOSITORY,
        PermissionSettlement,
        PermissionDeadlines,
        PERMISSION_BROADCASTER,
        CLOCK,
        PERMISSION_SETTINGS,
      ],
      useFactory: (
        registry: PermissionRegistry,
        requests: PermissionRequestRepository,
        settlement: PermissionSettlement,
        deadlines: PermissionDeadlines,
        broadcaster: PermissionBroadcaster,
        clock: Clock,
        settings: PermissionSettings,
      ) =>
        new RequestPermissionUseCase(
          registry,
          requests,
          settlement,
          deadlines,
          broadcaster,
          clock,
          settings,
        ),
    },
    {
      provide: ResolvePermissionUseCase,
      inject: [PermissionRegistry, PermissionSettlement, CLOCK],
      useFactory: (registry: PermissionRegistry, settlement: PermissionSettlement, clock: Clock) =>
        new ResolvePermissionUseCase(registry, settlement, clock),
    },
    {
      provide: ExtendPermissionUseCase,
      inject: [
        PermissionRegistry,
        PERMISSION_REQUEST_REPOSITORY,
        PermissionDeadlines,
        PERMISSION_BROADCASTER,
        CLOCK,
        PERMISSION_SETTINGS,
      ],
      useFactory: (
        registry: PermissionRegistry,
        requests: PermissionRequestRepository,
        deadlines: PermissionDeadlines,
        broadcaster: PermissionBroadcaster,
        clock: Clock,
        settings: PermissionSettings,
      ) => new ExtendPermissionUseCase(registry, requests, deadlines, broadcaster, clock, settings),
    },
    {
      provide: EndSessionPermissionsUseCase,
      inject: [PermissionRegistry, PermissionSettlement, CLOCK],
      useFactory: (registry: PermissionRegistry, settlement: PermissionSettlement, clock: Clock) =>
        new EndSessionPermissionsUseCase(registry, settlement, clock),
    },
    {
      // `permission.resolve` is a **response**, not a command: the server asked, and this answers.
      // The `permission.resolved` event that follows is fanned out by the module itself rather
      // than by the gateway, because the deadline and a session ending settle requests too, and
      // all three have to reach the wire through one path.
      provide: PERMISSION_HANDLERS.resolve,
      inject: [ResolvePermissionUseCase],
      useFactory: (resolve: ResolvePermissionUseCase) =>
        new ContractCommandHandler(
          'permission.resolve',
          permissionSchemas.resolve,
          async (command, context) => {
            // Losing the race is not an error. The ack is silent either way, and the client
            // learns who won from the event it has already been sent.
            await resolve.execute({
              requestId: command.requestId,
              decision: command.decision,
              reason: command.reason ?? null,
              scope: command.scope ?? null,
              userId: context.userId,
              // Only two clients exist, and the one that is not the app is the browser. A device
              // registry that can say better arrives with the mobile plan.
              resolvedFrom: 'web',
              watchesSession: (sessionId: SessionId) => context.isAttached(sessionId.value),
            });
          },
        ),
    },
    {
      provide: PERMISSION_HANDLERS.extend,
      inject: [ExtendPermissionUseCase],
      useFactory: (extend: ExtendPermissionUseCase) =>
        new ContractCommandHandler(
          'permission.extend',
          permissionSchemas.extend,
          async (command, context) => {
            await extend.execute({
              requestId: command.requestId,
              userId: context.userId,
              watchesSession: (sessionId: SessionId) => context.isAttached(sessionId.value),
            });
          },
        ),
    },
  ],
  exports: [
    ...Object.values(PERMISSION_HANDLERS),
    PermissionRegistry,
    RequestPermissionUseCase,
    ResolvePermissionUseCase,
    ExtendPermissionUseCase,
    EndSessionPermissionsUseCase,
  ],
})
export class PermissionModule {}
