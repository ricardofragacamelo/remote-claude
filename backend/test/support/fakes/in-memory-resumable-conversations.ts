import type { ResumableConversation, ResumableConversationSource } from '@application/session';
import type { ChainEntry } from '@domain/session';
import { UserId } from '@domain/auth';
import { ClaudeSessionId } from '@domain/transcript';

/** What a test says about a conversation in Claude's store. */
export interface ConversationSeed {
  readonly id: string;
  readonly cwd?: string | null;

  /** Who opened it here; absent for one begun in the editor or the terminal. */
  readonly openedBy?: string;

  /** Its entries, oldest first — what an edit-and-resend forks from. */
  readonly chain?: readonly ChainEntry[];
}

/**
 * Claude's store as `session` sees it when it continues a conversation: where each ran, and who
 * opened it here. `lookups` counts the questions, so a test can say that a refusal asked nothing.
 */
export class InMemoryResumableConversations implements ResumableConversationSource {
  private readonly conversations = new Map<string, ResumableConversation>();
  private readonly chains = new Map<string, readonly ChainEntry[]>();
  lookups = 0;

  /** When set, every lookup fails with it — the SDK that is down. */
  failWith: Error | null = null;

  add(seed: ConversationSeed): this {
    this.conversations.set(seed.id, {
      id: ClaudeSessionId.create(seed.id),
      cwd: seed.cwd === undefined ? '/srv/projects/app' : seed.cwd,
      openedBy: seed.openedBy === undefined ? undefined : UserId.create(seed.openedBy),
    });
    this.chains.set(seed.id, seed.chain ?? []);

    return this;
  }

  find(id: ClaudeSessionId): Promise<ResumableConversation | null> {
    this.lookups += 1;

    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }

    return Promise.resolve(this.conversations.get(id.value) ?? null);
  }

  chainOf(id: ClaudeSessionId): Promise<readonly ChainEntry[]> {
    return this.failWith === null
      ? Promise.resolve(this.chains.get(id.value) ?? [])
      : Promise.reject(this.failWith);
  }
}
