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
export function renumber(uuid: string, copy: number): string {
  return `${uuid.slice(0, 24)}${copy.toString(16).padStart(12, '0')}`;
}

/** The text of a prompt, when the message is one — what the SDK falls back to as the summary. */
function promptTextOf(message: SessionMessage | undefined): string | undefined {
  const body = message?.message as { content?: unknown } | undefined;
  return typeof body?.content === 'string' ? body.content : undefined;
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
    listSubagents: [] as string[],
    getSubagentMessages: [] as string[],
  };

  /** The subagents of each conversation: agent id → its messages, as the SDK files them apart. */
  private readonly subagents = new Map<string, Map<string, SessionMessage[]>>();

  /** Files the messages of a subagent of `sessionId` under `agentId`. */
  addSubagent(sessionId: string, agentId: string, messages: readonly SessionMessage[]): this {
    const agents = this.subagents.get(sessionId) ?? new Map<string, SessionMessage[]>();
    agents.set(agentId, [...messages]);
    this.subagents.set(sessionId, agents);
    return this;
  }

  listSubagents(sessionId: string): Promise<string[]> {
    this.calls.listSubagents.push(sessionId);
    return this.answer(() => [...(this.subagents.get(sessionId)?.keys() ?? [])]);
  }

  getSubagentMessages(sessionId: string, agentId: string): Promise<SessionMessage[]> {
    this.calls.getSubagentMessages.push(`${sessionId}/${agentId}`);
    return this.answer(() => [...(this.subagents.get(sessionId)?.get(agentId) ?? [])]);
  }

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

  /**
   * What the CLI does with `persistSession: true`: the conversation is filed under the directory the
   * session runs in, created by its first message and growing with every one after.
   *
   * Every write moves `lastModified` on, strictly — two turns written inside one millisecond would
   * otherwise leave the key the backend caches a read by where it was, and the second turn would be
   * served from the cache of the first.
   */
  persist(sessionId: string, cwd: string, messages: readonly SessionMessage[]): void {
    const existing = this.conversations.get(sessionId);
    const lastModified = Math.max(Date.now(), (existing?.info.lastModified ?? 0) + 1);

    if (existing === undefined) {
      const summary = promptTextOf(messages[0]);
      this.add({
        sessionId,
        directory: cwd,
        cwd,
        lastModified,
        messages,
        ...(summary === undefined ? {} : { summary }),
      });
      return;
    }

    this.append(sessionId, messages, lastModified);
  }

  /**
   * A fork: the history of `from` copied under `to`, filed where the fork runs — and nothing written
   * to `from`, which is the whole point of forking a conversation somebody else may be writing.
   */
  fork(from: string, to: string, cwd: string): void {
    const source = this.conversations.get(from);

    this.add({
      sessionId: to,
      directory: cwd,
      cwd,
      lastModified: Date.now(),
      messages: (source?.messages ?? []).map((message) => ({ ...message, session_id: to })),
      ...(source === undefined ? {} : { summary: source.info.summary }),
    });
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
            // No `dir` is the whole store, as the SDK answers it (plan 08, D-05).
            (options.dir === undefined || conversation.directory === options.dir) &&
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
