import { Module } from '@nestjs/common';

import { WS_COMMAND_HANDLERS } from '@adapter/inbound/ws/ws-command';
import type { WsCommandHandler } from '@adapter/inbound/ws/ws-command';
import { FolderWatches } from '@application/files';
import { AttachSessionUseCase, SessionRegistry } from '@application/session';
import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { DIAG_HANDLERS } from '@adapter/inbound/ws/diag/diag-commands';
import { PERMISSION_HANDLERS } from '@adapter/inbound/ws/permission/permission-commands';
import { DiagSessionOwnership } from '@adapter/outbound/diag/diag-session.ownership';
import { RegistrySessionOwnership } from '@adapter/outbound/session/registry-session.ownership';
import { SessionAttachHandler } from '@adapter/inbound/ws/session/session-attach.gateway-handler';
import { SESSION_HANDLERS } from '@adapter/inbound/ws/session/session-commands';
import { ConnectionWatchRelease } from '@adapter/inbound/ws/files/connection-watch.release';
import { SocketWatchSinks } from '@adapter/inbound/ws/files/socket-watch.sinks';
import {
  WorkspaceWatchHandler,
  workspaceUnwatchHandler,
} from '@adapter/inbound/ws/files/workspace-watch.gateway-handler';
import { FollowTranscriptUseCase } from '@application/transcript';
import { ConnectionFollowRelease } from '@adapter/inbound/ws/transcript/connection-follow.release';
import { SocketFollowSinks } from '@adapter/inbound/ws/transcript/socket-follow.sinks';
import {
  TranscriptFollowHandler,
  transcriptUnfollowHandler,
} from '@adapter/inbound/ws/transcript/transcript-follow.gateway-handler';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { AppGateway } from '../websocket/app.gateway';
import { ConnectionRegistry } from '../websocket/connection-registry';
import { FrameBuilder } from '../websocket/frame-builder';
import { SessionHub } from '../websocket/session-hub';
import { AuthModule } from './auth.module';
import { DiagModule } from './diag.module';
import { FilesModule } from './files.module';
import { PermissionModule } from './permission.module';
import { SessionModule } from './session.module';
import { TranscriptModule } from './transcript.module';
import { WebsocketModule } from './websocket.module';

/** DI token of `workspace.unwatch`, a plain contract command. */
const FILES_UNWATCH_HANDLER = Symbol('workspace.unwatch handler');

/** DI token of `transcript.unfollow`, a plain contract command. */
const TRANSCRIPT_UNFOLLOW_HANDLER = Symbol('transcript.unfollow handler');

/**
 * The gateway, and the table of commands it routes over.
 *
 * A command of the contract becomes a line in this list and a file in
 * `adapter/inbound/ws/<domain>/`. The gateway itself never grows a branch per command.
 */
const HANDLERS = [
  ...Object.values(DIAG_HANDLERS),
  SessionAttachHandler,
  ...Object.values(SESSION_HANDLERS),
  ...Object.values(PERMISSION_HANDLERS),
  WorkspaceWatchHandler,
  FILES_UNWATCH_HANDLER,
  TranscriptFollowHandler,
  TRANSCRIPT_UNFOLLOW_HANDLER,
];

@Module({
  imports: [
    AuthModule,
    DiagModule,
    FilesModule,
    PermissionModule,
    SessionModule,
    TranscriptModule,
    WebsocketModule,
  ],
  providers: [
    {
      // Composed here, where both kinds of session are already in scope: `session.attach` asks
      // whether this user owns this stream, and a live session and the diagnostic round trip are
      // two different things that can both answer yes.
      provide: AttachSessionUseCase,
      inject: [RegistrySessionOwnership, DiagSessionOwnership, SessionRegistry],
      useFactory: (
        live: RegistrySessionOwnership,
        diag: DiagSessionOwnership,
        registry: SessionRegistry,
      ) => new AttachSessionUseCase([live, diag], registry),
    },
    SessionAttachHandler,
    {
      // The stream of a watched folder: one sink per `watchId`, numbering its own `seq` and
      // owing an overflow to a socket that fell behind (plan 07, B-23).
      provide: SocketWatchSinks,
      inject: [ConnectionRegistry, FrameBuilder, SessionHub, SCHEDULER, LOGGER, APP_CONFIG],
      useFactory: (
        registry: ConnectionRegistry,
        frames: FrameBuilder,
        hub: SessionHub,
        scheduler: Scheduler,
        logger: Logger,
        config: AppConfig,
      ) =>
        new SocketWatchSinks({
          registry,
          frames,
          hub,
          scheduler,
          logger,
          maxBufferedBytes: config.files.watch.maxBufferedBytes,
        }),
    },
    {
      provide: WorkspaceWatchHandler,
      inject: [FolderWatches, SocketWatchSinks, LOGGER],
      useFactory: (watches: FolderWatches, sinks: SocketWatchSinks, logger: Logger) =>
        new WorkspaceWatchHandler(watches, sinks, logger),
    },
    {
      provide: FILES_UNWATCH_HANDLER,
      inject: [FolderWatches, LOGGER],
      useFactory: (watches: FolderWatches, logger: Logger) =>
        workspaceUnwatchHandler(watches, logger),
    },
    {
      // A socket that goes takes its watched folders with it, whatever closed it (S-142, S-147).
      provide: ConnectionWatchRelease,
      inject: [ConnectionRegistry, FolderWatches, LOGGER],
      useFactory: (registry: ConnectionRegistry, watches: FolderWatches, logger: Logger) =>
        new ConnectionWatchRelease(registry, watches, logger),
    },
    {
      // The stream of a followed conversation: one sink per `followId`, numbering its own `seq`
      // (plan 22, B-17).
      provide: SocketFollowSinks,
      inject: [ConnectionRegistry, FrameBuilder, SessionHub, LOGGER],
      useFactory: (
        registry: ConnectionRegistry,
        frames: FrameBuilder,
        hub: SessionHub,
        logger: Logger,
      ) => new SocketFollowSinks({ registry, frames, hub, logger }),
    },
    {
      provide: TranscriptFollowHandler,
      inject: [FollowTranscriptUseCase, SocketFollowSinks, LOGGER],
      useFactory: (follower: FollowTranscriptUseCase, sinks: SocketFollowSinks, logger: Logger) =>
        new TranscriptFollowHandler(follower, sinks, logger),
    },
    {
      provide: TRANSCRIPT_UNFOLLOW_HANDLER,
      inject: [FollowTranscriptUseCase, LOGGER],
      useFactory: (follower: FollowTranscriptUseCase, logger: Logger) =>
        transcriptUnfollowHandler(follower, logger),
    },
    {
      // A socket that goes takes the conversations it followed with it, whatever closed it (S-67).
      provide: ConnectionFollowRelease,
      inject: [ConnectionRegistry, FollowTranscriptUseCase, LOGGER],
      useFactory: (
        registry: ConnectionRegistry,
        follower: FollowTranscriptUseCase,
        logger: Logger,
      ) => new ConnectionFollowRelease(registry, follower, logger),
    },
    {
      provide: WS_COMMAND_HANDLERS,
      inject: [...HANDLERS],
      useFactory: (...handlers: WsCommandHandler[]) => handlers,
    },
    AppGateway,
  ],
  // The lifecycle closes the sockets at its own step of the shutdown, so it needs the gateway.
  exports: [AppGateway],
})
export class GatewayModule {}
