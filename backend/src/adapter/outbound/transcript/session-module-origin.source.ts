import { Inject, Injectable } from '@nestjs/common';

import { SESSION_ORIGIN_REPOSITORY } from '@application/session';
import type { SessionOriginRepository } from '@application/session';
import type { TranscriptOriginSource } from '@application/transcript';
import type { UserId } from '@domain/auth';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * `transcript` asking `session` which conversations it opened.
 *
 * The provenance is written by `session`, which owns it; `transcript` declares the question it
 * needs answered and this adapter joins the two ends — the whole of the coupling between the two
 * modules (docs/architecture/backend/03-modules.md#fronteiras).
 */
@Injectable()
export class SessionModuleOriginSource implements TranscriptOriginSource {
  constructor(
    @Inject(SESSION_ORIGIN_REPOSITORY) private readonly origins: SessionOriginRepository,
  ) {}

  openersOf(ids: readonly ClaudeSessionId[]): Promise<ReadonlyMap<string, UserId>> {
    return this.origins.openersOf(ids);
  }
}
