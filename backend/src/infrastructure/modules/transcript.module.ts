import { QUESTION_RECORD_SOURCE } from '@application/permission';
import type { QuestionRecordSource } from '@application/permission';
import { DrizzleQuestionRecordSource } from '@adapter/outbound/persistence/permission/drizzle-question-record.source';
import { Module } from '@nestjs/common';

import {
  FollowTranscriptUseCase,
  LIVE_CONVERSATION_SOURCE,
  ListTranscriptsUseCase,
  QuestionHistory,
  ReadPromptImageUseCase,
  ReadToolResultUseCase,
  ReadTranscriptUseCase,
  TranscriptAudience,
  TRANSCRIPT_ORIGIN_SOURCE,
  TRANSCRIPT_STORE,
} from '@application/transcript';
import type {
  LiveConversationSource,
  TranscriptOriginSource,
  TranscriptStore,
} from '@application/transcript';
import { CLOCK, ID_GENERATOR, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { WORKSPACE_ALLOWLIST_SOURCE } from '@application/workspace';
import type { WorkspaceAllowlistSource } from '@application/workspace';
import { TranscriptController } from '@adapter/inbound/http/transcript/transcript.controller';
import { AgentSdkTranscriptAdapter } from '@adapter/outbound/claude/transcript.adapter';
import {
  TRANSCRIPT_LIMITS,
  TRANSCRIPT_READ_LIMITS,
} from '@adapter/outbound/claude/transcript-reads';
import { realTranscriptSdk, TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { SessionModuleOriginSource } from '@adapter/outbound/transcript/session-module-origin.source';
import { SessionModuleLiveConversations } from '@adapter/outbound/transcript/session-module-live-conversations';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { AuthModule } from './auth.module';
import { SessionOriginModule } from './session-origin.module';
import { SessionRegistryModule } from './session-registry.module';
import { WorkspaceModule } from './workspace.module';

/**
 * The `transcript` module: the history, read through the Agent SDK and fenced by the allowlist.
 *
 * It imports the allowlist from `workspace` — the same fence that decides where Claude may run
 * decides what may be read — and the provenance and the registry of live sessions `session` keeps,
 * through the modules that hold them.
 * `session` imports it back for one thing, the store: continuing a conversation asks where it ran.
 * It holds no live session and writes nothing: the transcript is Claude's file, shared with the
 * editor, and never ours to change (docs/architecture/backend/03-modules.md#transcript).
 */
@Module({
  imports: [AuthModule, WorkspaceModule, SessionOriginModule, SessionRegistryModule],
  controllers: [TranscriptController],
  providers: [
    { provide: TRANSCRIPT_SDK, useValue: realTranscriptSdk },
    { provide: TRANSCRIPT_LIMITS, useValue: TRANSCRIPT_READ_LIMITS },
    { provide: TRANSCRIPT_STORE, useClass: AgentSdkTranscriptAdapter },
    { provide: TRANSCRIPT_ORIGIN_SOURCE, useClass: SessionModuleOriginSource },
    { provide: LIVE_CONVERSATION_SOURCE, useClass: SessionModuleLiveConversations },
    {
      provide: TranscriptAudience,
      inject: [
        WORKSPACE_ALLOWLIST_SOURCE,
        TRANSCRIPT_ORIGIN_SOURCE,
        LIVE_CONVERSATION_SOURCE,
        CLOCK,
        APP_CONFIG,
      ],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        origins: TranscriptOriginSource,
        live: LiveConversationSource,
        clock: Clock,
        config: AppConfig,
      ) =>
        new TranscriptAudience(allowlist, origins, live, {
          clock,
          activeWindowMs: config.transcript.activeWindowMs,
        }),
    },
    {
      provide: ListTranscriptsUseCase,
      inject: [WORKSPACE_ALLOWLIST_SOURCE, TRANSCRIPT_STORE, TranscriptAudience],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        store: TranscriptStore,
        audience: TranscriptAudience,
      ) => new ListTranscriptsUseCase(allowlist, store, audience),
    },
    // The questions of Claude in the history, joined to what this backend recorded of their answers
    // (plan 24, B-21) — read here, in the permission requests the permission flow already writes.
    { provide: QUESTION_RECORD_SOURCE, useClass: DrizzleQuestionRecordSource },
    {
      provide: QuestionHistory,
      inject: [QUESTION_RECORD_SOURCE],
      useFactory: (records: QuestionRecordSource) => new QuestionHistory(records),
    },
    {
      provide: ReadTranscriptUseCase,
      inject: [TRANSCRIPT_STORE, TranscriptAudience, QuestionHistory],
      useFactory: (
        store: TranscriptStore,
        audience: TranscriptAudience,
        questions: QuestionHistory,
      ) => new ReadTranscriptUseCase(store, audience, questions),
    },
    {
      provide: ReadToolResultUseCase,
      inject: [TRANSCRIPT_STORE, TranscriptAudience, APP_CONFIG],
      useFactory: (store: TranscriptStore, audience: TranscriptAudience, config: AppConfig) =>
        new ReadToolResultUseCase(store, audience, config.transcript.toolResultMaxBytes),
    },
    {
      provide: ReadPromptImageUseCase,
      inject: [TRANSCRIPT_STORE, TranscriptAudience, APP_CONFIG],
      useFactory: (store: TranscriptStore, audience: TranscriptAudience, config: AppConfig) =>
        new ReadPromptImageUseCase(store, audience, config.transcript.imageMaxBytes),
    },
    {
      // The follower of conversations begun elsewhere (plan 22, F2): what it sees of each tick is
      // logged here, at `debug` — counts, never a word of the conversation (S-72).
      provide: FollowTranscriptUseCase,
      inject: [
        TRANSCRIPT_STORE,
        TranscriptAudience,
        SCHEDULER,
        ID_GENERATOR,
        APP_CONFIG,
        LOGGER,
        QuestionHistory,
      ],
      useFactory: (
        store: TranscriptStore,
        audience: TranscriptAudience,
        scheduler: Scheduler,
        ids: IdGenerator,
        config: AppConfig,
        logger: Logger,
        questions: QuestionHistory,
      ) =>
        new FollowTranscriptUseCase(
          store,
          audience,
          scheduler,
          ids,
          config.transcript.follow,
          {
            looked: (conversationId, outcome) => {
              logger.debug(
                { op: 'transcript.follow', layer: 'application', conversationId, ...outcome },
                'followed conversation looked at',
              );
            },
            failed: (conversationId, error) => {
              logger.warn(
                { op: 'transcript.follow', layer: 'application', conversationId, err: error },
                'a look at a followed conversation failed; the next one tries again',
              );
            },
          },
          questions,
        ),
    },
  ],
  // The store, for `session`, which asks it where a conversation ran before continuing one; and the
  // follower, for the gateway, which hands it `transcript.follow`. The reads stay here.
  exports: [TRANSCRIPT_STORE, FollowTranscriptUseCase],
})
export class TranscriptModule {}
