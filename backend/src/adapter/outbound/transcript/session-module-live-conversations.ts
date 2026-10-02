import { Inject, Injectable } from '@nestjs/common';

import { SessionRegistry } from '@application/session';
import type { LiveConversationSource } from '@application/transcript';
import type { UserId } from '@domain/auth';
import type { ClaudeSessionId } from '@domain/transcript';

/**
 * `transcript` asking `session` which conversations are live for the caller.
 *
 * The registry is `session`'s and is only read here: the conversation itself, for one of ours
 * continued in place, or the one it continues, for a fork — the same question that turns resuming
 * what is live into an attach (plan 04, S-24). The whole of the coupling, in one adapter
 * (docs/architecture/backend/03-modules.md#fronteiras).
 */
@Injectable()
export class SessionModuleLiveConversations implements LiveConversationSource {
  constructor(@Inject(SessionRegistry) private readonly registry: SessionRegistry) {}

  liveSessionOf(conversation: ClaudeSessionId, userId: UserId): string | null {
    return this.registry.findConversation(conversation, userId)?.session.id.value ?? null;
  }
}
