import type {
  ListSessionsOptions,
  SDKMessage,
  SDKSessionInfo,
  SessionMessage,
} from '@anthropic-ai/claude-agent-sdk';

import type { TranscriptSdk } from '@adapter/outbound/claude/transcript-sdk';
import { loadFixture } from './fixture';

/** One conversation of the scripted store. */
interface StoredConversation {
  info: SDKSessionInfo;

  /** The project directory the SDK files it under — `listSessions({ dir })` matches on this. */
  readonly directory: string;

  /** Set when it lives in a worktree of `directory`: only `includeWorktrees: true` brings it in. */
  readonly worktree: boolean;

  messages: SessionMessage[];
}

/** How a conversation is added: the metadata the SDK reports, and where it is filed. */
export interface ConversationSeed {
  readonly sessionId: string;
  readonly directory: string;
  readonly cwd?: string;
  readonly summary?: string;
  readonly lastModified?: number;
  readonly worktree?: boolean;
  readonly messages?: readonly SessionMessage[];
}

/** A promise the test settles by hand, to hold a read open while something else happens. */
export interface Gate {
  readonly opened: Promise<void>;
  open(): void;
}

function gate(): Gate {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { opened, open };
}

/**
 * The messages of a **captured** run, as `getSessionMessages` returns them.
 *
 * `SessionMessage` is the `user` and `assistant` messages of the stream without their streaming
 * envelope — the same `uuid`, `session_id` and API `message`. So a transcript is derived from the
 * recording `pnpm fixtures:record` made against the real SDK, never typed from memory
 * ([D-04 of plan 01](../../../../docs/plans/01-live-session/decisions.md)).
 *
 * @param copy when given, every uuid is suffixed so one recording can stand for several turns
 */
export function capturedTranscript(name = 'tool-turn', copy?: number): SessionMessage[] {
  return loadFixture(name)
    .messages.filter(
      (message): message is Extract<SDKMessage, { type: 'user' | 'assistant' }> =>
        message.type === 'user' || message.type === 'assistant',
    )
    .map((message) => ({
      type: message.type,
      uuid: copy === undefined ? String(message.uuid) : renumber(String(message.uuid), copy),
      session_id: String(message.session_id),
      message: message.message,
      parent_tool_use_id: message.parent_tool_use_id,
      parent_agent_id: null,
    }));
}

/** A uuid of the same shape, made distinct per copy: the last group carries the copy number. */
function renumber(uuid: string, copy: number): string {
  return `${uuid.slice(0, 24)}${copy.toString(16).padStart(12, '0')}`;
}

/**
 * Claude's store of conversations, scripted.
 *
 * It answers the three reads the way the SDK was measured to: `listSessions({ dir })` returns what
 * is filed under `dir`, worktrees only when asked; `getSessionInfo` answers `undefined` for an id it
 * does not hold; and `getSessionMessages` answers `[]` both for an empty conversation and for an id
 * it does not hold — the collision the adapter has to resolve with the info (S-56).
 */
export class ScriptedTranscripts implements TranscriptSdk {
  private readonly conversations = new Map<string, StoredConversation>();

  /** Every call, in order, with what it was asked. */
  readonly calls = {
    listSessions: [] as ListSessionsOptions[],
    getSessionInfo: [] as string[],
    getSessionMessages: [] as string[],
  };

  /** Set to make every read fail, the way an SDK that cannot reach its store does. */
  failWith: Error | null = null;

  /** Set to hold every `getSessionMessages` until the test opens it. */
  private held: Gate | null = null;

  add(seed: ConversationSeed): this {
    this.conversations.set(seed.sessionId, {
      info: {
        sessionId: seed.sessionId,
        summary: seed.summary ?? `conversation ${seed.sessionId.slice(0, 8)}`,
        lastModified: seed.lastModified ?? 1_758_800_000_000,
        ...(seed.cwd === undefined ? {} : { cwd: seed.cwd }),
      },
      directory: seed.directory,
      worktree: seed.worktree ?? false,
      messages: [...(seed.messages ?? [])],
    });

    return this;
  }

  /** A live session writing: messages at the end, and a new `lastModified`. */
  append(sessionId: string, messages: readonly SessionMessage[], lastModified: number): void {
    const conversation = this.require(sessionId);
    conversation.messages = [...conversation.messages, ...messages];
    conversation.info = { ...conversation.info, lastModified };
  }

  /** A compaction: the chain the SDK rebuilds is another one, and a new `lastModified`. */
  rewrite(sessionId: string, messages: readonly SessionMessage[], lastModified: number): void {
    const conversation = this.require(sessionId);
    conversation.messages = [...messages];
    conversation.info = { ...conversation.info, lastModified };
  }

  /** Holds every read of messages from now on, until the gate is opened. */
  hold(): Gate {
    this.held = gate();
    return this.held;
  }

  listSessions(options: ListSessionsOptions): Promise<SDKSessionInfo[]> {
    this.calls.listSessions.push(options);

    return this.answer(() =>
      [...this.conversations.values()]
        .filter(
          (conversation) =>
            conversation.directory === options.dir &&
            (!conversation.worktree || options.includeWorktrees !== false),
        )
        .map((conversation) => conversation.info),
    );
  }

  getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
    this.calls.getSessionInfo.push(sessionId);

    return this.answer(() => this.conversations.get(sessionId)?.info);
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    this.calls.getSessionMessages.push(sessionId);

    // The snapshot is taken when the call is made, as one parse of the file is: whatever is
    // written while the read is held open is not in it.
    const snapshot = [...(this.conversations.get(sessionId)?.messages ?? [])];

    if (this.held !== null) {
      await this.held.opened;
    }

    return this.answer(() => snapshot);
  }

  private answer<T>(value: () => T): Promise<T> {
    return this.failWith === null ? Promise.resolve(value()) : Promise.reject(this.failWith);
  }

  private require(sessionId: string): StoredConversation {
    const conversation = this.conversations.get(sessionId);

    if (conversation === undefined) {
      throw new Error(`the scripted store holds no conversation ${sessionId}`);
    }

    return conversation;
  }
}
