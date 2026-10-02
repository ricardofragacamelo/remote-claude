import { Inject, Injectable } from '@nestjs/common';

import { SESSION_ORIGIN_REPOSITORY } from '@application/session';
import type {
  ResumableConversation,
  ResumableConversationSource,
  SessionOriginRepository,
} from '@application/session';
import { TRANSCRIPT_STORE } from '@application/transcript';
import type { TranscriptStore } from '@application/transcript';
import type { ChainEntry } from '@domain/session';
import type { ClaudeSessionId, TranscriptMessage } from '@domain/transcript';

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

  async chainOf(id: ClaudeSessionId): Promise<readonly ChainEntry[]> {
    const session = await this.store.find(id);

    return session === null
      ? []
      : (await this.store.messages(session)).map((message) => ({
          id: message.id,
          isPrompt: isPrompt(message),
        }));
  }
}

/**
 * Whether a message of the transcript is a prompt somebody typed: a user message of the main
 * conversation — not a tool's result, which is a user message too, nor one of a subagent.
 */
function isPrompt(message: TranscriptMessage): boolean {
  return message.events.some(
    (event) =>
      event.type === 'message.completed' &&
      event.payload['role'] === 'user' &&
      event.payload['parentToolUseId'] === undefined,
  );
}
