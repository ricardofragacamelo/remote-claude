import { Module } from '@nestjs/common';

import {
  CLAUDE_SESSION_ID_GENERATOR,
  CLAUDE_SESSION_PORT,
  FOLDER_LOCATOR,
  ListLiveSessionsUseCase,
  PENDING_PERMISSIONS,
  CloseSessionUseCase,
  CommandCatalog,
  InterruptSessionUseCase,
  ListSessionCommandsUseCase,
  ListUndoPointsUseCase,
  RewindFilesUseCase,
  UNDO_DISK,
  UNDO_JOURNAL,
  UndoPlanner,
  PromptSessionUseCase,
  ReapIdleSessionsUseCase,
  SessionEnder,
  ShutdownSessionsUseCase,
  SESSION_BROADCASTER,
  SESSION_FILE_EVENTS,
  SESSION_FILE_JOURNAL,
  SESSION_ORIGIN_REPOSITORY,
  RESUMABLE_CONVERSATION_SOURCE,
  SESSION_PERMISSION_GATE,
  SessionRegistry,
  SetSessionModelUseCase,
  SetSessionPermissionModeUseCase,
  StartSessionUseCase,
  TOOL_INVOCATION_RECORDER,
  WORKSPACE_RESOLVER,
} from '@application/session';
import type {
  ClaudeSessionPort,
  FolderLocator,
  PendingPermissions,
  UndoDisk,
  UndoJournal,
  ResumableConversationSource,
  SessionBroadcaster,
  SessionOriginRepository,
  WorkspaceResolver,
} from '@application/session';
import { CLOCK, ID_GENERATOR, PATH_LOCK } from '@application/shared';
import type { PathLock } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { ContractCommandHandler } from '@adapter/inbound/ws/contract-command.gateway-handler';
import { SessionController } from '@adapter/inbound/http/session/session.controller';
import { LiveSessionsController } from '@adapter/inbound/http/session/live-sessions.controller';
import { RegistryPendingPermissions } from '@adapter/outbound/session/registry-pending-permissions';
import { SessionRewindHandler } from '@adapter/inbound/ws/session/session-rewind.gateway-handler';
import { NodeUndoDisk } from '@adapter/outbound/checkpoint/node-undo.disk';
import { JournalUndoStore } from '@adapter/outbound/session/journal-undo.store';
import { SnapshotPurgeJob } from '../jobs/snapshot-purge.job';
import { SessionReaperJob } from '../jobs/session-reaper.job';
import { PermissionBridge } from '@adapter/outbound/claude/permission-bridge';
import {
  RecordDecisionOnResolved,
  ReleaseAgentLoopOnResolved,
} from '@adapter/outbound/permission/permission-resolved.listeners';
import { SESSION_HANDLERS, sessionSchemas } from '@adapter/inbound/ws/session/session-commands';
import { SessionStartHandler } from '@adapter/inbound/ws/session/session-start.gateway-handler';
import { AgentSdkClaudeSessionAdapter } from '@adapter/outbound/claude/agent-sdk.adapter';
import { QUERY_FACTORY, realQueryFactory } from '@adapter/outbound/claude/query.factory';
import { BUNDLED_CLI_VERSION, bundledCliVersion } from '@adapter/outbound/claude/cli-version';
import { SESSION_LIMITS } from '@adapter/outbound/claude/session-limits';
import { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { TranscriptModuleConversationSource } from '@adapter/outbound/session/transcript-module-conversation.source';
import { AuditToolInvocationRecorder } from '@adapter/outbound/session/audit-tool-invocation.recorder';
import { DiskSessionFileJournal } from '@adapter/outbound/session/disk-session-file.journal';
import { EmitterSessionFileEvents } from '@adapter/outbound/session/emitter-session-file.events';
import { HubSessionBroadcaster } from '@adapter/outbound/session/hub-session.broadcaster';
import { RegistrySessionOwnership } from '@adapter/outbound/session/registry-session.ownership';
import { WorkspaceModuleResolver } from '@adapter/outbound/session/workspace-module.resolver';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { RecordAuditEventUseCase } from '@application/audit';
import { EndSessionPermissionsUseCase, RequestPermissionUseCase } from '@application/permission';
import { UuidGenerator } from '@shared/ids/uuid-generator';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';
import { PermissionModule } from './permission.module';
import { WebsocketModule } from './websocket.module';
import { SessionOriginModule } from './session-origin.module';
import { SessionRegistryModule } from './session-registry.module';
import { TranscriptModule } from './transcript.module';
import { WorkspaceModule } from './workspace.module';

/**
 * The `session` module: the live session of Claude, across all four layers.
 *
 * The registry is a singleton with the configured limit baked in, because "how many sessions are
 * open" is a property of the process and there is exactly one process. Every use case is built
 * with `new` in a factory — three lines each, and what keeps `application/` free of decorators.
 */
@Module({
  imports: [
    AuditModule,
    AuthModule,
    PermissionModule,
    SessionOriginModule,
    SessionRegistryModule,
    TranscriptModule,
    WorkspaceModule,
    WebsocketModule,
  ],
  controllers: [SessionController, LiveSessionsController],
  providers: [
    { provide: QUERY_FACTORY, useValue: realQueryFactory },
    { provide: BUNDLED_CLI_VERSION, useFactory: () => bundledCliVersion() },
    {
      provide: SESSION_LIMITS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.session.limits,
    },
    { provide: TOOL_INVOCATION_RECORDER, useClass: AuditToolInvocationRecorder },
    DrizzleSessionFileRepository,
    {
      provide: FileSnapshotStore,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new FileSnapshotStore(config.checkpoints.directory, {
          maxFileBytes: config.checkpoints.maxFileBytes,
          maxStoreBytes: config.checkpoints.maxStoreBytes,
        }),
    },
    { provide: SESSION_FILE_EVENTS, useClass: EmitterSessionFileEvents },
    { provide: SESSION_FILE_JOURNAL, useClass: DiskSessionFileJournal },
    // The undo: the journal read by conversation, the disk written atomically and never through a
    // link, and the planner the preview and the undo share so they can never disagree.
    { provide: UNDO_JOURNAL, useClass: JournalUndoStore },
    { provide: UNDO_DISK, useClass: NodeUndoDisk },
    {
      provide: UndoPlanner,
      inject: [UNDO_JOURNAL, UNDO_DISK, CLOCK, PATH_LOCK],
      useFactory: (journal: UndoJournal, disk: UndoDisk, clock: Clock, lock: PathLock) =>
        new UndoPlanner(journal, disk, clock, lock),
    },
    {
      provide: ListUndoPointsUseCase,
      inject: [SessionRegistry, UndoPlanner],
      useFactory: (registry: SessionRegistry, planner: UndoPlanner) =>
        new ListUndoPointsUseCase(registry, planner),
    },
    {
      provide: RewindFilesUseCase,
      inject: [SessionRegistry, UndoPlanner, RecordAuditEventUseCase, CLOCK],
      useFactory: (
        registry: SessionRegistry,
        planner: UndoPlanner,
        trail: RecordAuditEventUseCase,
        clock: Clock,
      ) => new RewindFilesUseCase(registry, planner, trail, clock),
    },
    SnapshotPurgeJob,
    // Where a conversation to continue ran, and who opened it here — `transcript` and provenance.
    { provide: RESUMABLE_CONVERSATION_SOURCE, useClass: TranscriptModuleConversationSource },
    { provide: CLAUDE_SESSION_ID_GENERATOR, useClass: UuidGenerator },
    {
      // Built by factory rather than by reflection, because it needs the broadcaster token and a
      // token cannot be inferred from a type.
      provide: PermissionBridge,
      inject: [
        RequestPermissionUseCase,
        EndSessionPermissionsUseCase,
        SessionRegistry,
        SESSION_BROADCASTER,
        LOGGER,
      ],
      useFactory: (
        request: RequestPermissionUseCase,
        endPermissions: EndSessionPermissionsUseCase,
        registry: SessionRegistry,
        broadcaster: SessionBroadcaster,
        logger: Logger,
      ) => new PermissionBridge(request, endPermissions, registry, broadcaster, logger),
    },
    { provide: SESSION_PERMISSION_GATE, useExisting: PermissionBridge },
    // The two consumers of `permission.resolved` that need something from this module. They are
    // registered here and not in `PermissionModule` because that module deliberately knows nothing
    // about sessions, and one of these releases the agent loop of one.
    ReleaseAgentLoopOnResolved,
    RecordDecisionOnResolved,
    { provide: CLAUDE_SESSION_PORT, useClass: AgentSdkClaudeSessionAdapter },
    { provide: SESSION_BROADCASTER, useClass: HubSessionBroadcaster },
    WorkspaceModuleResolver,
    { provide: WORKSPACE_RESOLVER, useExisting: WorkspaceModuleResolver },
    { provide: FOLDER_LOCATOR, useExisting: WorkspaceModuleResolver },
    { provide: PENDING_PERMISSIONS, useClass: RegistryPendingPermissions },
    {
      provide: ListLiveSessionsUseCase,
      inject: [FOLDER_LOCATOR, SessionRegistry, PENDING_PERMISSIONS],
      useFactory: (
        folders: FolderLocator,
        registry: SessionRegistry,
        pending: PendingPermissions,
      ) => new ListLiveSessionsUseCase(folders, registry, pending),
    },
    RegistrySessionOwnership,
    {
      provide: SessionEnder,
      inject: [SessionRegistry, SESSION_BROADCASTER],
      useFactory: (registry: SessionRegistry, broadcaster: SessionBroadcaster) =>
        new SessionEnder(registry, broadcaster),
    },
    {
      provide: ReapIdleSessionsUseCase,
      inject: [SessionRegistry, SessionEnder, CLOCK, APP_CONFIG],
      useFactory: (
        registry: SessionRegistry,
        ender: SessionEnder,
        clock: Clock,
        config: AppConfig,
      ) => new ReapIdleSessionsUseCase(registry, ender, clock, config.session.idleTtlMs),
    },
    SessionReaperJob,
    {
      provide: ShutdownSessionsUseCase,
      inject: [SessionRegistry, SessionEnder],
      useFactory: (registry: SessionRegistry, ender: SessionEnder) =>
        new ShutdownSessionsUseCase(registry, ender),
    },
    {
      provide: StartSessionUseCase,
      inject: [
        WORKSPACE_RESOLVER,
        SessionRegistry,
        CLAUDE_SESSION_PORT,
        SESSION_BROADCASTER,
        CLOCK,
        ID_GENERATOR,
        APP_CONFIG,
        CLAUDE_SESSION_ID_GENERATOR,
        SESSION_ORIGIN_REPOSITORY,
        RESUMABLE_CONVERSATION_SOURCE,
        RecordAuditEventUseCase,
      ],
      useFactory: (
        workspaces: WorkspaceResolver,
        registry: SessionRegistry,
        claude: ClaudeSessionPort,
        broadcaster: SessionBroadcaster,
        clock: Clock,
        ids: IdGenerator,
        config: AppConfig,
        claudeIds: IdGenerator,
        origins: SessionOriginRepository,
        conversations: ResumableConversationSource,
        trail: RecordAuditEventUseCase,
      ) =>
        new StartSessionUseCase(
          workspaces,
          registry,
          claude,
          broadcaster,
          clock,
          ids,
          config.session.defaults,
          { ids: claudeIds, origins },
          { conversations, trail },
        ),
    },

    // One per process, like the registry: the list is a property of the installation, and two
    // catalogues would ask the CLI twice for the same answer (S-36).
    { provide: CommandCatalog, useValue: new CommandCatalog() },
    {
      provide: PromptSessionUseCase,
      inject: [SessionRegistry, CommandCatalog],
      useFactory: (registry: SessionRegistry, catalog: CommandCatalog) =>
        new PromptSessionUseCase(registry, catalog),
    },
    {
      provide: ListSessionCommandsUseCase,
      inject: [SessionRegistry, CommandCatalog],
      useFactory: (registry: SessionRegistry, catalog: CommandCatalog) =>
        new ListSessionCommandsUseCase(registry, catalog),
    },
    {
      provide: InterruptSessionUseCase,
      inject: [SessionRegistry],
      useFactory: (registry: SessionRegistry) => new InterruptSessionUseCase(registry),
    },
    {
      provide: SetSessionModelUseCase,
      inject: [SessionRegistry],
      useFactory: (registry: SessionRegistry) => new SetSessionModelUseCase(registry),
    },
    {
      provide: SetSessionPermissionModeUseCase,
      inject: [SessionRegistry],
      useFactory: (registry: SessionRegistry) => new SetSessionPermissionModeUseCase(registry),
    },
    {
      provide: CloseSessionUseCase,
      inject: [SessionRegistry, SessionEnder],
      useFactory: (registry: SessionRegistry, ender: SessionEnder) =>
        new CloseSessionUseCase(registry, ender),
    },
    { provide: SESSION_HANDLERS.start, useClass: SessionStartHandler },
    { provide: SESSION_HANDLERS.rewind, useClass: SessionRewindHandler },
    {
      provide: SESSION_HANDLERS.prompt,
      inject: [PromptSessionUseCase],
      useFactory: (prompt: PromptSessionUseCase) =>
        new ContractCommandHandler(
          'session.prompt',
          sessionSchemas.prompt,
          async (command, context) =>
            // Queued and never refused for arriving mid-turn: it is what the SDK does natively and
            // what the Claude Code UI does. What is refused is a slash command the installation does
            // not have, and that refusal is this command's `error` (S-34). The prompt reaches the CLI
            // only after the ack, so no event of its turn can overtake it.
            ({ afterAck: await prompt.execute(command.sessionId, command.text, context.userId) }),
        ),
    },
    {
      provide: SESSION_HANDLERS.interrupt,
      inject: [InterruptSessionUseCase],
      useFactory: (interrupt: InterruptSessionUseCase) =>
        new ContractCommandHandler(
          'session.interrupt',
          sessionSchemas.session,
          (command, context) => interrupt.execute(command.sessionId, context.userId),
        ),
    },
    {
      provide: SESSION_HANDLERS.setModel,
      inject: [SetSessionModelUseCase],
      useFactory: (setModel: SetSessionModelUseCase) =>
        new ContractCommandHandler('session.setModel', sessionSchemas.model, (command, context) =>
          setModel.execute(command.sessionId, command.model, context.userId),
        ),
    },
    {
      provide: SESSION_HANDLERS.setPermissionMode,
      inject: [SetSessionPermissionModeUseCase],
      useFactory: (setMode: SetSessionPermissionModeUseCase) =>
        new ContractCommandHandler(
          'session.setPermissionMode',
          sessionSchemas.mode,
          (command, context) => setMode.execute(command.sessionId, command.mode, context.userId),
        ),
    },
    {
      provide: SESSION_HANDLERS.close,
      inject: [CloseSessionUseCase],
      useFactory: (close: CloseSessionUseCase) =>
        new ContractCommandHandler('session.close', sessionSchemas.session, (command, context) =>
          close.execute(command.sessionId, context.userId),
        ),
    },
    {
      // No use case behind it: the language of a **connection** is transport state, and routing it
      // through `application/` would add a layer that only forwards.
      provide: SESSION_HANDLERS.setLocale,
      useValue: new ContractCommandHandler(
        'session.setLocale',
        sessionSchemas.locale,
        (command, context) => {
          context.setLocale(command.locale);
        },
      ),
    },
    {
      // Also without a use case, and also idempotent: a connection asking to stop receiving
      // something it is already not receiving has got what it wanted.
      provide: SESSION_HANDLERS.detach,
      useValue: new ContractCommandHandler(
        'session.detach',
        sessionSchemas.session,
        (command, context) => {
          context.detach(command.sessionId);
        },
      ),
    },
  ],
  exports: [
    ...Object.values(SESSION_HANDLERS),
    RegistrySessionOwnership,
    SessionRegistryModule,
    ShutdownSessionsUseCase,
    SessionReaperJob,
  ],
})
export class SessionModule {}
