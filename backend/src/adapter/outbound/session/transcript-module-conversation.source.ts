import { Inject, Injectable } from '@nestjs/common';

import { SESSION_ORIGIN_REPOSITORY } from '@application/session';
import type {
  ResumableConversation,
  ResumableConversationSource,
  SessionOriginRepository,
} from '@application/session';
import { TRANSCRIPT_STORE } from '@application/transcript';
import type { TranscriptStore } from '@application/transcript';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * `session` asking about a conversation it was told to continue.
 *
 * Two questions, two owners: where the conversation ran is Claude's store, read by `transcript`
 * through the SDK — never by a parser of ours; who opened it here is the provenance `session`
 * keeps. Neither reads a message: deciding a resume needs none.
 */
@Injectable()
export class TranscriptModuleConversationSource implements ResumableConversationSource {
  constructor(
    @Inject(TRANSCRIPT_STORE) private readonly store: TranscriptStore,
    @Inject(SESSION_ORIGIN_REPOSITORY) private readonly origins: SessionOriginRepository,
  ) {}

  async find(id: ClaudeSessionId): Promise<ResumableConversation | null> {
    const session = await this.store.find(id);

    if (session === null) {
      return null;
    }

    const openers = await this.origins.openersOf([id]);

    return { id, cwd: session.cwd, openedBy: openers.get(id.value) };
  }
}
