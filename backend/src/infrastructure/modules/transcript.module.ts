import { Module } from '@nestjs/common';

import {
  LIVE_CONVERSATION_SOURCE,
  ListTranscriptsUseCase,
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
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
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
    {
      provide: ReadTranscriptUseCase,
      inject: [TRANSCRIPT_STORE, TranscriptAudience],
      useFactory: (store: TranscriptStore, audience: TranscriptAudience) =>
        new ReadTranscriptUseCase(store, audience),
    },
  ],
  // The store alone: `session` asks it where a conversation ran before continuing one. The use
  // cases stay here — nobody else lists or reads the history.
  exports: [TRANSCRIPT_STORE],
})
export class TranscriptModule {}
