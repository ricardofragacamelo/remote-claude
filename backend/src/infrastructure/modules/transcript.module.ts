import { Module } from '@nestjs/common';

import {
  ListTranscriptsUseCase,
  ReadTranscriptUseCase,
  TRANSCRIPT_ORIGIN_SOURCE,
  TRANSCRIPT_STORE,
} from '@application/transcript';
import type { TranscriptOriginSource, TranscriptStore } from '@application/transcript';
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
import { AuthModule } from './auth.module';
import { SessionOriginModule } from './session-origin.module';
import { WorkspaceModule } from './workspace.module';

/**
 * The `transcript` module: the history, read through the Agent SDK and fenced by the allowlist.
 *
 * It imports the allowlist from `workspace` — the same fence that decides where Claude may run
 * decides what may be read — and the provenance `session` keeps, through the module that holds it.
 * `session` imports it back for one thing, the store: continuing a conversation asks where it ran.
 * It holds no live session and writes nothing: the transcript is Claude's file, shared with the
 * editor, and never ours to change (docs/architecture/backend/03-modules.md#transcript).
 */
@Module({
  imports: [AuthModule, WorkspaceModule, SessionOriginModule],
  controllers: [TranscriptController],
  providers: [
    { provide: TRANSCRIPT_SDK, useValue: realTranscriptSdk },
    { provide: TRANSCRIPT_LIMITS, useValue: TRANSCRIPT_READ_LIMITS },
    { provide: TRANSCRIPT_STORE, useClass: AgentSdkTranscriptAdapter },
    { provide: TRANSCRIPT_ORIGIN_SOURCE, useClass: SessionModuleOriginSource },
    {
      provide: ListTranscriptsUseCase,
      inject: [WORKSPACE_ALLOWLIST_SOURCE, TRANSCRIPT_STORE, TRANSCRIPT_ORIGIN_SOURCE],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        store: TranscriptStore,
        origins: TranscriptOriginSource,
      ) => new ListTranscriptsUseCase(allowlist, store, origins),
    },
    {
      provide: ReadTranscriptUseCase,
      inject: [WORKSPACE_ALLOWLIST_SOURCE, TRANSCRIPT_STORE, TRANSCRIPT_ORIGIN_SOURCE],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        store: TranscriptStore,
        origins: TranscriptOriginSource,
      ) => new ReadTranscriptUseCase(allowlist, store, origins),
    },
  ],
  // The store alone: `session` asks it where a conversation ran before continuing one. The use
  // cases stay here — nobody else lists or reads the history.
  exports: [TRANSCRIPT_STORE],
})
export class TranscriptModule {}
