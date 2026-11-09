import { Module } from '@nestjs/common';

import {
  ApplyPermissionModeUseCase,
  ChangePermissionRuleExpiryUseCase,
  DescribePermissionRuleUseCase,
  DescribePermissionUseCase,
  EndSessionPermissionsUseCase,
  EvaluatePermissionUseCase,
  ExportPermissionRulesUseCase,
  ExtendPermissionUseCase,
  GrantPermissionRuleUseCase,
  ImportPermissionRulesUseCase,
  ListPermissionRulesUseCase,
  ListRuleHistoryUseCase,
  ListRuleInvocationsUseCase,
  ListRuleTemplatesUseCase,
  PERMISSION_BROADCASTER,
  PERMISSION_EVENTS,
  PERMISSION_REQUEST_REPOSITORY,
  PERMISSION_RULE_REPOSITORY,
  PermissionAutoAnswer,
  PermissionDeadlines,
  PermissionRegistry,
  PermissionRuleBook,
  PermissionSettlement,
  MigrateRulesUseCase,
  PreviewPermissionRuleUseCase,
  PreviewRuleImportUseCase,
  RULE_FOLDER_RESOLVER,
  RULE_MIGRATION_STORE,
  RequestPermissionUseCase,
  ResolvePermissionUseCase,
  RestorePermissionRulesUseCase,
  RevokeMcpServerRulesUseCase,
  RevokePermissionRuleUseCase,
  RevokePermissionRulesUseCase,
  RuleDialects,
  SimulatePermissionRulesUseCase,
  SummarizePermissionRulesUseCase,
  TOOL_KIND_BACKFILL_STORE,
} from '@application/permission';
import { SessionRegistry } from '@application/session';
import type {
  PermissionBroadcaster,
  PermissionEvents,
  PermissionRequestRepository,
  PermissionRuleRepository,
  PermissionSettings,
  RuleFolderResolver,
  RuleMigrationStore,
  ToolKindBackfillStore,
} from '@application/permission';
import {
  AUDIT_EVENT_READER,
  AUDIT_TRAIL_READER,
  QueryAuditTrailUseCase,
  RecordAuditEventUseCase,
} from '@application/audit';
import type { AuditEventReader, AuditTrailReader } from '@application/audit';
import { ToolClassifiers } from '@application/engine';
import { ResolveDeviceUseCase } from '@application/auth';
import { CLOCK, ID_GENERATOR, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { SessionId } from '@domain/session';
import type { Clock, IdGenerator } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { PermissionController } from '@adapter/inbound/http/permission/permission.controller';
import { PermissionRulesController } from '@adapter/inbound/http/permission-rules/permission-rules.controller';
import { ContractCommandHandler } from '@adapter/inbound/ws/contract-command.gateway-handler';
import {
  PERMISSION_HANDLERS,
  permissionSchemas,
} from '@adapter/inbound/ws/permission/permission-commands';
import { EmitterPermissionEvents } from '@adapter/outbound/permission/emitter-permission.events';
import { HubPermissionBroadcaster } from '@adapter/outbound/permission/hub-permission.broadcaster';
import { WorkspaceModuleRuleFolderResolver } from '@adapter/outbound/permission/workspace-module.rule-folder-resolver';
import { DrizzleAuditEventReader } from '@adapter/outbound/persistence/audit/drizzle-audit-event.reader';
import { DrizzleAuditTrailReader } from '@adapter/outbound/persistence/audit/drizzle-audit-trail.reader';
import { DrizzlePermissionRequestRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-request.repository';
import { DrizzlePermissionRuleRepository } from '@adapter/outbound/persistence/permission/drizzle-permission-rule.repository';
import { DrizzleRuleMigrationStore } from '@adapter/outbound/persistence/permission/drizzle-rule-migration.store';
import { DrizzleToolKindBackfillStore } from '@adapter/outbound/persistence/permission/drizzle-tool-kind-backfill.store';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';
import { SessionRegistryModule } from './session-registry.module';
import { RuleMigrationJob } from '../jobs/rule-migration.job';
import { engineRuleDialectProviders, engineToolClassifierProviders } from './engines';
import { WebsocketModule } from './websocket.module';
import { WorkspaceModule } from './workspace.module';

/** DI token of the numbers a request and a rule live by. They are configuration, never a client's. */
export const PERMISSION_SETTINGS = Symbol('PermissionSettings');

/**
 * The `permission` module: the fence of the product, across all four layers.
 *
 * The registry is a singleton with the process, like the session registry and for the same reason:
 * an open request is a promise the engine is holding its loop for, and none of that survives a
 * restart.
 *
 * It knows nothing about `session`, deliberately. The bridge that turns `canUseTool` into a
 * question lives on the session side and depends on this module; the arrow points one way, so
 * neither has to be built to test the other
 * (docs/architecture/backend/03-modules.md#fronteiras).
 */
@Module({
  // `AuthModule` for `ResolveDeviceUseCase`: answering a permission request is the one command
  // that a registered device has to be **approved** to send (B-05).
  // It is also what `BearerAuthGuard` resolves the caller with, on the HTTP routes below.
  // `AuditModule` for the trail: granting and revoking a rule are recorded like a device's approval.
  imports: [AuditModule, AuthModule, SessionRegistryModule, WebsocketModule, WorkspaceModule],
  controllers: [PermissionController, PermissionRulesController],
  providers: [
    ...engineToolClassifierProviders,
    {
      provide: PERMISSION_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => config.permission,
    },
    { provide: PERMISSION_REQUEST_REPOSITORY, useClass: DrizzlePermissionRequestRepository },
    { provide: PERMISSION_RULE_REPOSITORY, useClass: DrizzlePermissionRuleRepository },
    { provide: RULE_FOLDER_RESOLVER, useClass: WorkspaceModuleRuleFolderResolver },
    // `permission`'s own instances, never `AuditQueryModule`'s — that module exports neither reader
    // to any consumer, on purpose (docs/architecture/backend/03-modules.md#audit): the uses, the
    // invocations and the history of a rule read the trail by this port, and only by it, which is
    // exactly the arrow backend/03's fronteiras draw for this module (B-01).
    { provide: AUDIT_TRAIL_READER, useClass: DrizzleAuditTrailReader },
    { provide: AUDIT_EVENT_READER, useClass: DrizzleAuditEventReader },
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
      provide: PermissionRuleBook,
      inject: [PermissionRegistry, PERMISSION_RULE_REPOSITORY, LOGGER],
      useFactory: (registry: PermissionRegistry, rules: PermissionRuleRepository, logger: Logger) =>
        new PermissionRuleBook(registry, rules, (error, requestId) => {
          // Not a refusal and not an authorisation: the request goes to a human, as if no rule
          // existed. Loud, because a rule that silently stopped answering looks like a revocation.
          logger.error(
            { op: 'permission.rule.lookup', layer: 'application', requestId, err: error },
            'the permission rules could not be read; the request is put to a human',
          );
        }),
    },
    {
      provide: GrantPermissionRuleUseCase,
      inject: [
        PERMISSION_RULE_REPOSITORY,
        RecordAuditEventUseCase,
        ID_GENERATOR,
        CLOCK,
        PERMISSION_SETTINGS,
        RULE_FOLDER_RESOLVER,
      ],
      useFactory: (
        rules: PermissionRuleRepository,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
        settings: PermissionSettings,
        folders: RuleFolderResolver,
      ) => new GrantPermissionRuleUseCase(rules, trail, ids, clock, settings, folders),
    },
    // The data step of plan 28 · B-33: the rules out of the engine's grammar, and the kind of every
    // record of a call — once per boot, after the SQL migrations.
    ...engineRuleDialectProviders,
    { provide: RULE_MIGRATION_STORE, useClass: DrizzleRuleMigrationStore },
    { provide: TOOL_KIND_BACKFILL_STORE, useClass: DrizzleToolKindBackfillStore },
    {
      provide: MigrateRulesUseCase,
      inject: [
        RULE_MIGRATION_STORE,
        TOOL_KIND_BACKFILL_STORE,
        RuleDialects,
        ToolClassifiers,
        CLOCK,
      ],
      useFactory: (
        store: RuleMigrationStore,
        backfill: ToolKindBackfillStore,
        dialects: RuleDialects,
        classifiers: ToolClassifiers,
        clock: Clock,
      ) => new MigrateRulesUseCase(store, backfill, dialects, classifiers, clock),
    },
    {
      provide: RuleMigrationJob,
      inject: [MigrateRulesUseCase, LOGGER],
      useFactory: (migrate: MigrateRulesUseCase, logger: Logger) =>
        new RuleMigrationJob(migrate, logger),
    },
    {
      provide: RevokePermissionRulesUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, RecordAuditEventUseCase, ID_GENERATOR, CLOCK],
      useFactory: (
        rules: PermissionRuleRepository,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
      ) => new RevokePermissionRulesUseCase(rules, trail, ids, clock),
    },
    {
      // The batch of one (plan 15, D-06): `DELETE /permission-rules/:ruleId` shares the one
      // implementation `POST /permission-rules/revoke` uses, rather than a second that ages apart.
      provide: RevokePermissionRuleUseCase,
      inject: [RevokePermissionRulesUseCase],
      useFactory: (batch: RevokePermissionRulesUseCase) => new RevokePermissionRuleUseCase(batch),
    },
    {
      provide: RestorePermissionRulesUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, GrantPermissionRuleUseCase, CLOCK, PERMISSION_SETTINGS],
      useFactory: (
        rules: PermissionRuleRepository,
        grant: GrantPermissionRuleUseCase,
        clock: Clock,
        settings: PermissionSettings,
      ) => new RestorePermissionRulesUseCase(rules, grant, clock, settings),
    },
    {
      provide: ChangePermissionRuleExpiryUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, RecordAuditEventUseCase, CLOCK, PERMISSION_SETTINGS],
      useFactory: (
        rules: PermissionRuleRepository,
        trail: RecordAuditEventUseCase,
        clock: Clock,
        settings: PermissionSettings,
      ) => new ChangePermissionRuleExpiryUseCase(rules, trail, clock, settings),
    },
    {
      provide: RevokeMcpServerRulesUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, RecordAuditEventUseCase, CLOCK],
      useFactory: (rules: PermissionRuleRepository, trail: RecordAuditEventUseCase, clock: Clock) =>
        new RevokeMcpServerRulesUseCase(rules, trail, clock),
    },
    {
      provide: ListPermissionRulesUseCase,
      inject: [
        PERMISSION_RULE_REPOSITORY,
        CLOCK,
        AUDIT_TRAIL_READER,
        RULE_FOLDER_RESOLVER,
        APP_CONFIG,
        PERMISSION_SETTINGS,
      ],
      useFactory: (
        rules: PermissionRuleRepository,
        clock: Clock,
        trail: AuditTrailReader,
        folders: RuleFolderResolver,
        config: AppConfig,
        settings: PermissionSettings,
      ) =>
        new ListPermissionRulesUseCase(
          rules,
          clock,
          trail,
          folders,
          config.audit.retentionDays,
          settings,
        ),
    },
    {
      provide: SummarizePermissionRulesUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, CLOCK],
      useFactory: (rules: PermissionRuleRepository, clock: Clock) =>
        new SummarizePermissionRulesUseCase(rules, clock),
    },
    {
      // `permission`'s own `QueryAuditTrailUseCase` — never `AuditQueryModule`'s, which exports
      // neither it nor the reader it wraps to any consumer (see the note above).
      provide: QueryAuditTrailUseCase,
      inject: [AUDIT_TRAIL_READER, ToolClassifiers],
      useFactory: (trail: AuditTrailReader, classifiers: ToolClassifiers) =>
        new QueryAuditTrailUseCase(trail, classifiers),
    },
    {
      provide: SimulatePermissionRulesUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, AUDIT_TRAIL_READER, ToolClassifiers, CLOCK],
      useFactory: (
        rules: PermissionRuleRepository,
        trail: AuditTrailReader,
        classifiers: ToolClassifiers,
        clock: Clock,
      ) => new SimulatePermissionRulesUseCase(rules, trail, classifiers, clock),
    },
    {
      provide: ListRuleTemplatesUseCase,
      useFactory: () => new ListRuleTemplatesUseCase(),
    },
    {
      provide: ExportPermissionRulesUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, RecordAuditEventUseCase, ID_GENERATOR, CLOCK],
      useFactory: (
        rules: PermissionRuleRepository,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
      ) => new ExportPermissionRulesUseCase(trail, rules, ids, clock),
    },
    {
      provide: PreviewRuleImportUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, PERMISSION_SETTINGS, CLOCK],
      useFactory: (rules: PermissionRuleRepository, settings: PermissionSettings, clock: Clock) =>
        new PreviewRuleImportUseCase(rules, settings, clock),
    },
    {
      provide: ImportPermissionRulesUseCase,
      inject: [GrantPermissionRuleUseCase, RecordAuditEventUseCase, ID_GENERATOR, CLOCK],
      useFactory: (
        grant: GrantPermissionRuleUseCase,
        trail: RecordAuditEventUseCase,
        ids: IdGenerator,
        clock: Clock,
      ) => new ImportPermissionRulesUseCase(grant, trail, ids, clock),
    },
    {
      provide: ListRuleInvocationsUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, QueryAuditTrailUseCase],
      useFactory: (rules: PermissionRuleRepository, trail: QueryAuditTrailUseCase) =>
        new ListRuleInvocationsUseCase(rules, trail),
    },
    {
      provide: ListRuleHistoryUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, AUDIT_EVENT_READER],
      useFactory: (rules: PermissionRuleRepository, events: AuditEventReader) =>
        new ListRuleHistoryUseCase(rules, events),
    },
    {
      provide: DescribePermissionRuleUseCase,
      inject: [
        PERMISSION_RULE_REPOSITORY,
        CLOCK,
        RULE_FOLDER_RESOLVER,
        AUDIT_TRAIL_READER,
        APP_CONFIG,
        PERMISSION_SETTINGS,
      ],
      useFactory: (
        rules: PermissionRuleRepository,
        clock: Clock,
        folders: RuleFolderResolver,
        trail: AuditTrailReader,
        config: AppConfig,
        settings: PermissionSettings,
      ) =>
        new DescribePermissionRuleUseCase(
          rules,
          clock,
          folders,
          trail,
          config.audit.retentionDays,
          settings,
        ),
    },
    {
      provide: PreviewPermissionRuleUseCase,
      inject: [PERMISSION_RULE_REPOSITORY, RULE_FOLDER_RESOLVER],
      useFactory: (rules: PermissionRuleRepository, folders: RuleFolderResolver) =>
        new PreviewPermissionRuleUseCase(rules, folders),
    },
    {
      provide: EvaluatePermissionUseCase,
      inject: [
        PERMISSION_RULE_REPOSITORY,
        PermissionRegistry,
        SessionRegistry,
        RULE_FOLDER_RESOLVER,
        CLOCK,
      ],
      useFactory: (
        rules: PermissionRuleRepository,
        registry: PermissionRegistry,
        sessions: SessionRegistry,
        folders: RuleFolderResolver,
        clock: Clock,
      ) => new EvaluatePermissionUseCase(rules, registry, sessions, folders, clock),
    },
    {
      provide: PermissionAutoAnswer,
      inject: [PermissionRuleBook, PermissionSettlement],
      useFactory: (rules: PermissionRuleBook, settlement: PermissionSettlement) =>
        new PermissionAutoAnswer(rules, settlement),
    },
    {
      provide: RequestPermissionUseCase,
      inject: [
        PermissionRegistry,
        PERMISSION_REQUEST_REPOSITORY,
        PermissionAutoAnswer,
        PermissionDeadlines,
        PERMISSION_BROADCASTER,
        PERMISSION_EVENTS,
        CLOCK,
        PERMISSION_SETTINGS,
      ],
      useFactory: (
        registry: PermissionRegistry,
        requests: PermissionRequestRepository,
        autoAnswer: PermissionAutoAnswer,
        deadlines: PermissionDeadlines,
        broadcaster: PermissionBroadcaster,
        events: PermissionEvents,
        clock: Clock,
        settings: PermissionSettings,
      ) =>
        new RequestPermissionUseCase(
          registry,
          requests,
          autoAnswer,
          deadlines,
          broadcaster,
          events,
          clock,
          settings,
        ),
    },
    {
      provide: ApplyPermissionModeUseCase,
      inject: [PermissionRegistry, PermissionAutoAnswer, CLOCK],
      useFactory: (registry: PermissionRegistry, autoAnswer: PermissionAutoAnswer, clock: Clock) =>
        new ApplyPermissionModeUseCase(registry, autoAnswer, clock),
    },
    {
      provide: ResolvePermissionUseCase,
      inject: [PermissionRegistry, PermissionSettlement, GrantPermissionRuleUseCase, CLOCK],
      useFactory: (
        registry: PermissionRegistry,
        settlement: PermissionSettlement,
        grant: GrantPermissionRuleUseCase,
        clock: Clock,
      ) => new ResolvePermissionUseCase(registry, settlement, grant, clock),
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
      // Reads the registry and nothing else: the answer a deep link revalidates against is the
      // same memory the attach replays from, so the two can never disagree about a request.
      provide: DescribePermissionUseCase,
      inject: [PermissionRegistry, PERMISSION_SETTINGS],
      useFactory: (registry: PermissionRegistry, settings: PermissionSettings) =>
        new DescribePermissionUseCase(registry, settings),
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
      inject: [ResolvePermissionUseCase, ResolveDeviceUseCase],
      useFactory: (resolve: ResolvePermissionUseCase, devices: ResolveDeviceUseCase) =>
        new ContractCommandHandler(
          'permission.resolve',
          permissionSchemas.resolve,
          async (command, context) => {
            // **Before** anything else. A device that is only registered may watch this
            // session and may not answer this question. Both refusals are `403` rather than
            // `401`, because renewing the token changes nothing about either (S-04, S-05).
            await devices.ensureCanDecide(context.userId, context.installId);

            // Losing the race is not an error. The ack is silent either way, and the client
            // learns who won from the event it has already been sent.
            await resolve.execute({
              requestId: command.requestId,
              decision: command.decision,
              reason: command.reason ?? null,
              scope: command.scope ?? null,
              reach: command.reach ?? null,
              answers:
                command.answers?.map((given) => ({
                  questionId: given.questionId,
                  selected: given.selected,
                  other: given.other ?? null,
                })) ?? null,
              userId: context.userId,
              // The socket said which installation it is in the handshake; no installation is a
              // browser, which is the only other client there is.
              resolvedFrom: context.installId === null ? 'web' : 'mobile',
              watchesSession: (sessionId: SessionId) => context.isAttached(sessionId.value),
            });
          },
        ),
    },
    {
      provide: PERMISSION_HANDLERS.extend,
      inject: [ExtendPermissionUseCase, ResolveDeviceUseCase],
      useFactory: (extend: ExtendPermissionUseCase, devices: ResolveDeviceUseCase) =>
        new ContractCommandHandler(
          'permission.extend',
          permissionSchemas.extend,
          async (command, context) => {
            // The same fence as answering. Extending does not authorise anything, but it moves
            // the deadline — and the deadline is the only protection there is against a session
            // that hangs for ever. A device that may not decide may not move it either.
            await devices.ensureCanDecide(context.userId, context.installId);

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
    ApplyPermissionModeUseCase,
    ResolvePermissionUseCase,
    ExtendPermissionUseCase,
    EndSessionPermissionsUseCase,
    RevokeMcpServerRulesUseCase,
  ],
})
export class PermissionModule {}
