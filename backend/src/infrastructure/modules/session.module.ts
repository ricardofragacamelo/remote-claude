import { Module } from '@nestjs/common';

import {
  CLAUDE_SESSION_ID_GENERATOR,
  CLAUDE_SESSION_PORT,
  CloseSessionUseCase,
  InterruptSessionUseCase,
  PromptSessionUseCase,
  SESSION_BROADCASTER,
  SESSION_FILE_JOURNAL,
  SESSION_ORIGIN_REPOSITORY,
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
  SessionBroadcaster,
  SessionOriginRepository,
  WorkspaceResolver,
} from '@application/session';
import { CLOCK, ID_GENERATOR } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { ContractCommandHandler } from '@adapter/inbound/ws/contract-command.gateway-handler';
import { PermissionBridge } from '@adapter/outbound/claude/permission-bridge';
import {
  RecordDecisionOnResolved,
  ReleaseAgentLoopOnResolved,
} from '@adapter/outbound/permission/permission-resolved.listeners';
import { SESSION_HANDLERS, sessionSchemas } from '@adapter/inbound/ws/session/session-commands';
import { AgentSdkClaudeSessionAdapter } from '@adapter/outbound/claude/agent-sdk.adapter';
import { QUERY_FACTORY, realQueryFactory } from '@adapter/outbound/claude/query.factory';
import { SESSION_LIMITS } from '@adapter/outbound/claude/session-limits';
import { FileSnapshotStore } from '@adapter/outbound/checkpoint/file-snapshot.store';
import { DrizzleSessionFileRepository } from '@adapter/outbound/persistence/session/drizzle-session-file.repository';
import { DrizzleSessionOriginRepository } from '@adapter/outbound/persistence/session/drizzle-session-origin.repository';
import { AuditToolInvocationRecorder } from '@adapter/outbound/session/audit-tool-invocation.recorder';
import { DiskSessionFileJournal } from '@adapter/outbound/session/disk-session-file.journal';
import { HubSessionBroadcaster } from '@adapter/outbound/session/hub-session.broadcaster';
import { RegistrySessionOwnership } from '@adapter/outbound/session/registry-session.ownership';
import { WorkspaceModuleResolver } from '@adapter/outbound/session/workspace-module.resolver';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { EndSessionPermissionsUseCase, RequestPermissionUseCase } from '@application/permission';
import { UuidGenerator } from '@shared/ids/uuid-generator';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { AuditModule } from './audit.module';
import { PermissionModule } from './permission.module';
import { WebsocketModule } from './websocket.module';
import { WorkspaceModule } from './workspace.module';

/**
 * The `session` module: the live session of Claude, across all four layers.
 *
 * The registry is a singleton with the configured limit baked in, because "how many sessions are
 * open" is a property of the process and there is exactly one process. Every use case is built
 * with `new` in a factory — three lines each, and what keeps `application/` free of decorators.
 */
@Module({
  imports: [AuditModule, PermissionModule, WorkspaceModule, WebsocketModule],
  providers: [
    { provide: QUERY_FACTORY, useValue: realQueryFactory },
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
    { provide: SESSION_FILE_JOURNAL, useClass: DiskSessionFileJournal },
    // That we opened a conversation: written before anything is spawned, read by `transcript`.
    { provide: SESSION_ORIGIN_REPOSITORY, useClass: DrizzleSessionOriginRepository },
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
    { provide: WORKSPACE_RESOLVER, useClass: WorkspaceModuleResolver },
    RegistrySessionOwnership,
    {
      provide: SessionRegistry,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new SessionRegistry(config.session.maxConcurrent),
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
        ),
    },

    {
      provide: PromptSessionUseCase,
      inject: [SessionRegistry],
      useFactory: (registry: SessionRegistry) => new PromptSessionUseCase(registry),
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
      inject: [SessionRegistry, SESSION_BROADCASTER],
      useFactory: (registry: SessionRegistry, broadcaster: SessionBroadcaster) =>
        new CloseSessionUseCase(registry, broadcaster),
    },
    {
      provide: SESSION_HANDLERS.start,
      inject: [StartSessionUseCase],
      useFactory: (startSession: StartSessionUseCase) =>
        new ContractCommandHandler(
          'session.start',
          sessionSchemas.start,
          async (command, context) => {
            const session = await startSession.execute({
              workspacePath: command.workspacePath,
              model: command.model ?? null,
              permissionMode: command.permissionMode ?? null,
              resumeSessionId: command.resumeSessionId ?? null,
              userId: context.userId,
            });

            // Whoever opened the session is watching it: fan-out only reaches attached connections,
            // so without this the caller would miss the events of the session it just opened.
            context.attach(session.id.value);

            return {
              sessionId: session.id.value,
              type: 'session.started',
              payload: {
                sessionId: session.id.value,
                workspacePath: session.workspace.value,
                model: session.model,
                permissionMode: session.permissionMode,
              },
            };
          },
        ),
    },
    {
      provide: SESSION_HANDLERS.prompt,
      inject: [PromptSessionUseCase],
      useFactory: (prompt: PromptSessionUseCase) =>
        new ContractCommandHandler('session.prompt', sessionSchemas.prompt, (command, context) => {
          // Queued and never refused, even mid-turn: it is what the SDK does natively and what
          // the Claude Code UI does. Rejecting a concurrent prompt was our own policy, and wrong.
          prompt.execute(command.sessionId, command.text, context.userId);
        }),
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
    SessionRegistry,
    SESSION_ORIGIN_REPOSITORY,
  ],
})
export class SessionModule {}
