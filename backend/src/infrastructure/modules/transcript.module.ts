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
import { SessionModule } from './session.module';
import { WorkspaceModule } from './workspace.module';

/**
 * The `transcript` module: the history, read through the Agent SDK and fenced by the allowlist.
 *
 * A leaf. It imports the allowlist from `workspace` — the same fence that decides where Claude may
 * run decides what may be read — and the provenance from `session`, and nobody imports it. It
 * holds no live session and writes nothing: the transcript is Claude's file, shared with the
 * editor, and never ours to change (docs/architecture/backend/03-modules.md#transcript).
 */
@Module({
  imports: [AuthModule, WorkspaceModule, SessionModule],
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
})
export class TranscriptModule {}
