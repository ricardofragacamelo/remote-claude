import { CLAUDE_ENGINE } from './claude-engine';
import { Inject, Injectable } from '@nestjs/common';
import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { EngineTranscriptStore, StoredImage } from '@application/transcript';
import { payloadRecord } from '@application/session';
import { NOTICE_STORE } from '@application/notice';
import type { NoticeStore } from '@application/notice';
import { TranscriptTimeoutError, TranscriptUnavailableError } from '@domain/transcript';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';
import { LOGGER, type Logger } from '@shared/logging/logger';
import type { SessionNoticePayload } from '@remote-claude/contracts';
import { withinDeadline } from './deadline';
import { historicalEvents, SdkMessageMapper, timestampOf } from './sdk-message.mapper';
import { mergedWithPersistedNotices } from './persisted-notice-merge';
import type { TimedTranscriptMessage } from './persisted-notice-merge';
import { contentsOf, imagesOf } from './transcript-contents';
import type { TranscriptContents } from './transcript-contents';
import { ReadLimiter, SharedListing, TRANSCRIPT_LIMITS, TranscriptCache } from './transcript-reads';
import type { TranscriptReadLimits } from './transcript-reads';
import { TRANSCRIPT_SDK } from './transcript-sdk';
import type { TranscriptSdk } from './transcript-sdk';
import { EngineId } from '@domain/engine';
import type { ConversationRef } from '@domain/engine';
import { claudeConversation } from './claude-conversation';

/** The three reads, named as they appear in the log and in the error a client receives. */
type TranscriptOperation =
  | 'list sessions'
  | 'list every session'
  | 'describe a session'
  | 'read messages'
  | 'list subagents'
  | 'read a subagent';

/**
 * Claude's store of conversations, through the Agent SDK — and only through it.
 *
 * Everything this class knows about a transcript it learns from `listSessions`,
 * `getSessionInfo` and `getSessionMessages`. It never opens a file: the JSONL is internal to
 * Claude Code, shared with the editor and changes format without notice, and `pnpm lint:arch`
 * fails the build if anything in the transcript slice reaches for the filesystem (S-09).
 *
 * Every read goes through the same three protections, in this order:
 *
 * 1. **the cache**, for messages only, keyed by id and `lastModified` — a conversation read twice
 *    without being written in between is parsed once (S-64);
 * 2. **the limiter**, for every read — only so many parses at once (S-70);
 * 3. **the deadline** — a read that does not answer in time is `504`, and one that throws is `502`,
 *    never `500`: the store is upstream (S-05, S-68).
 *
 * Both sides of the edge are logged at `debug`, and neither carries content: counts, ids and
 * durations, never a summary, a prompt or a message — the history is the user's, and the log is
 * not (S-72).
 */
@Injectable()
export class AgentSdkTranscriptAdapter implements EngineTranscriptStore {
  readonly engine = EngineId.create(CLAUDE_ENGINE);

  conversationOf(id: string): ConversationRef | null {
    return claudeConversation(id);
  }

  private readonly limiter: ReadLimiter;
  private readonly cache: TranscriptCache<readonly TimedTranscriptMessage[]>;

  /** The whole outputs and the images, of fewer conversations — what weighs (plan 22, D-18). */
  private readonly contents: TranscriptCache<TranscriptContents>;

  /** A folder's listing, shared by whoever asks for it at the same time (plan 08, S-31). */
  private readonly listings = new SharedListing<readonly TranscriptSession[]>(0);

  /** The whole store, shared and kept for a moment — the subfolder filter polls it (D-05). */
  private readonly wholeStore: SharedListing<readonly TranscriptSession[]>;

  constructor(
    @Inject(TRANSCRIPT_SDK) private readonly sdk: TranscriptSdk,
    @Inject(TRANSCRIPT_LIMITS) private readonly limits: TranscriptReadLimits,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(NOTICE_STORE) private readonly notices: NoticeStore,
  ) {
    this.limiter = new ReadLimiter(limits.concurrentReads);
    this.cache = new TranscriptCache(limits.cachedSessions);
    this.contents = new TranscriptCache(limits.cachedContents);
    this.wholeStore = new SharedListing(limits.wholeStoreTtlMs);
  }

  async list(directory: string): Promise<readonly TranscriptSession[]> {
    // `includeWorktrees: false` stated, never left to the default — which is `true`, and would
    // bring in sessions from another path on disk than the one that cleared the allowlist.
    const { value, hit } = await this.listings.read(directory, () =>
      this.sessionsFrom('list sessions', { directory }, () =>
        this.sdk.listSessions({ dir: directory, includeWorktrees: false }),
      ),
    );

    this.logListing({ directory }, value, hit);
    return value;
  }

  async listAll(): Promise<readonly TranscriptSession[]> {
    // The whole store, worktrees out for the same reason as above; the caller fences by `cwd`.
    const { value, hit } = await this.wholeStore.read('*', () =>
      this.sessionsFrom('list every session', {}, () =>
        this.sdk.listSessions({ includeWorktrees: false }),
      ),
    );

    this.logListing({ directory: '*' }, value, hit);
    return value;
  }

  /** One listing of the store, as sessions this build can address. */
  private async sessionsFrom(
    operation: TranscriptOperation,
    context: Readonly<Record<string, string>>,
    read: () => Promise<readonly SDKSessionInfo[]>,
  ): Promise<readonly TranscriptSession[]> {
    const infos = await this.call(operation, context, read);
    const sessions = infos.flatMap((info) => toSession(info) ?? []);

    this.logger.debug(
      {
        op: 'engine.transcript.list',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        ...context,
        sessions: sessions.length,
        unaddressable: infos.length - sessions.length,
      },
      'transcript sessions read from the store',
    );

    return sessions;
  }

  /** The listing a caller received — counts and whether it was shared, never a summary. */
  private logListing(
    context: { readonly directory: string },
    sessions: readonly TranscriptSession[],
    hit: boolean,
  ): void {
    this.logger.debug(
      {
        op: 'engine.transcript.list',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        ...context,
        sessions: sessions.length,
        shared: hit,
      },
      'transcript sessions listed',
    );
  }

  async find(id: ConversationRef): Promise<TranscriptSession | null> {
    const info = await this.call('describe a session', { claudeSessionId: id.id }, () =>
      this.sdk.getSessionInfo(id.id),
    );
    const session = info === undefined ? null : toSession(info);

    this.logger.debug(
      {
        op: 'engine.transcript.find',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        claudeSessionId: id.id,
        found: session !== null,
      },
      'transcript session described',
    );

    return session;
  }

  async messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]> {
    const claudeSessionId = session.id.id;

    // No `limit` and no `offset`: they cut what comes back and not what the SDK does, which parses
    // the whole file either way. The whole conversation is read once and sliced from the cache.
    const { value, hit } = await this.cache.read(
      claudeSessionId,
      session.lastModified,
      async () => {
        const read = await this.readWhole(session);

        // The same read fills the index of contents: the SDK has just returned everything it holds.
        void this.contents.read(claudeSessionId, session.lastModified, () =>
          Promise.resolve(contentsOf(read)),
        );
        return messagesOf(read, session);
      },
    );

    this.logger.debug(
      {
        op: 'engine.transcript.messages',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        claudeSessionId,
        lastModified: session.lastModified,
        messages: value.length,
        cache: hit ? 'hit' : 'miss',
      },
      'transcript messages read',
    );

    // Outside the cache above: a notice persisted after the transcript was last cached must still
    // show up on the next read, and the cache is keyed by the transcript's own `lastModified` —
    // which a notice never changes (Plan 27, F7, D-15).
    const notices = await this.persistedNotices(session.id);

    return mergedWithPersistedNotices(value, notices);
  }

  /**
   * The notices kept outside the transcript for [conversation] — empty, never thrown, when the
   * store fails: a page of real messages is still worth more than a `502` over a side copy the
   * engine itself never had (S-121).
   */
  private async persistedNotices(conversation: ConversationRef): Promise<SessionNoticePayload[]> {
    try {
      return [...(await this.notices.listFor(conversation))];
    } catch (error) {
      this.logger.error(
        {
          op: 'engine.transcript.notices',
          layer: 'adapter',
          engine: CLAUDE_ENGINE,
          conversationId: conversation.id,
          err: error,
        },
        'failed to read persisted notices; history read continues without them',
      );
      return [];
    }
  }

  async subagentMessages(
    session: TranscriptSession,
    toolUseId: string,
  ): Promise<readonly TranscriptMessage[] | null> {
    const { claudeSessionId, options } = sdkCallOf(session);

    // Cached like the conversation, by the conversation's version: a subagent only grows while the
    // conversation is written, and that moves `lastModified`.
    const { value } = await this.cache.read(
      `${claudeSessionId}/${toolUseId}`,
      session.lastModified,
      async () => {
        const found = await this.findInSubagents(claudeSessionId, options, (messages) => {
          if (!messages.some((message) => message.parent_tool_use_id === toolUseId)) {
            return null;
          }
          // The subagent's own mapper: its pending-injection and task-list state are its own
          // stream, never the main chain's or another subagent's (plan 27, F5, B-17).
          const mapper = new SdkMessageMapper(session.cwd ?? '');
          return messages.map((message) => toMessage(message, mapper));
        });

        return found ?? NO_SUBAGENT;
      },
    );

    this.logger.debug(
      {
        op: 'engine.transcript.subagent',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        claudeSessionId,
        toolUseId,
        found: value !== NO_SUBAGENT,
        messages: value.length,
      },
      'subagent messages read',
    );

    return value === NO_SUBAGENT ? null : value;
  }

  async toolResult(session: TranscriptSession, toolUseId: string): Promise<string | null> {
    const { value, hit } = await this.contentsFor(session);
    const text = value.results.get(toolUseId) ?? null;

    // The id, whether it was there and how long it is — never what it says (S-27).
    this.logger.debug(
      {
        op: 'engine.transcript.toolResult',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        claudeSessionId: session.id.id,
        toolUseId,
        found: text !== null,
        characters: text?.length ?? 0,
        cache: hit ? 'hit' : 'miss',
      },
      'tool result read',
    );

    return text;
  }

  async promptImage(session: TranscriptSession, blockId: string): Promise<StoredImage | null> {
    const { value, hit } = await this.contentsFor(session);
    const direct = value.images.get(blockId) ?? null;
    const image = direct ?? (await this.subagentImage(session, blockId));

    // The type and the length of the encoding — never a byte of the image (S-33).
    this.logger.debug(
      {
        op: 'engine.transcript.promptImage',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        claudeSessionId: session.id.id,
        blockId,
        found: image !== null,
        mediaType: image?.mediaType ?? null,
        encodedLength: image?.data.length ?? 0,
        cache: hit ? 'hit' : 'miss',
      },
      'prompt image read',
    );

    return image;
  }

  /**
   * An image nested in a subagent's own `tool_result`, searched only once the main chain's did not
   * have the `blockId` the route was given (plan 27, B-15, S-59).
   *
   * Not cached: a conversation with a subagent card still open paid this cost already, and one
   * nobody opened yet is read once, the same cost `subagentMessages` would pay to open it.
   */
  private subagentImage(session: TranscriptSession, blockId: string): Promise<StoredImage | null> {
    const { claudeSessionId, options } = sdkCallOf(session);

    return this.findInSubagents(claudeSessionId, options, (messages) => {
      const image = imagesOf(messages).get(blockId);
      return image ?? null;
    });
  }

  /**
   * The first subagent whose own messages give [find] something: lists the conversation's subagents
   * once, and reads each one's messages at most once, in order — shared by `subagentMessages` and
   * `subagentImage` so the SDK calls that list and read a subagent live in exactly one place.
   */
  private async findInSubagents<T>(
    claudeSessionId: string,
    options: { dir?: string },
    find: (messages: readonly SessionMessage[]) => T | null,
  ): Promise<T | null> {
    const agents = await this.call('list subagents', { claudeSessionId }, () =>
      this.sdk.listSubagents(claudeSessionId, options),
    );

    for (const agentId of agents) {
      const messages = await this.call('read a subagent', { claudeSessionId, agentId }, () =>
        this.sdk.getSubagentMessages(claudeSessionId, agentId, options),
      );

      const found = find(messages);
      if (found !== null) {
        return found;
      }
    }

    return null;
  }

  /**
   * The contents of a conversation at its version — indexed when its messages were read, or read again
   * when the index let it go. The second read fills the cache of the events too: it paid for both.
   */
  private contentsFor(
    session: TranscriptSession,
  ): Promise<{ readonly value: TranscriptContents; readonly hit: boolean }> {
    const claudeSessionId = session.id.id;

    return this.contents.read(claudeSessionId, session.lastModified, async () => {
      const read = await this.readWhole(session);

      void this.cache.read(claudeSessionId, session.lastModified, () =>
        Promise.resolve(messagesOf(read, session)),
      );
      return contentsOf(read);
    });
  }

  /**
   * Everything the SDK holds of a conversation's main chain, in one call — `system` entries
   * included (plan 27, F5, B-16), so a compaction's trace is in the read at all, even though it
   * carries no `subtype` or payload of its own (measured, B-01). Subagents read without it: a
   * subagent's own transcript never held one to begin with (never measured carrying `system`
   * entries), so asking costs a slightly larger parse for nothing.
   */
  private readWhole(session: TranscriptSession): Promise<SessionMessage[]> {
    const { claudeSessionId, options } = sdkCallOf(session);

    return this.call('read messages', { claudeSessionId }, () =>
      this.sdk.getSessionMessages(claudeSessionId, { ...options, includeSystemMessages: true }),
    );
  }

  /**
   * One read of the store: limited, under a deadline, and with every failure translated.
   *
   * The deadline stops the **caller** waiting; it cannot stop the SDK, which keeps parsing, and so
   * the limiter's slot is held until the read itself settles.
   */
  private async call<T>(
    operation: TranscriptOperation,
    context: Readonly<Record<string, string>>,
    read: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();

    this.logger.debug(
      {
        op: 'engine.transcript.read',
        layer: 'adapter',
        engine: CLAUDE_ENGINE,
        operation,
        ...context,
      },
      'reading the transcript store',
    );

    try {
      return await withinDeadline(
        this.scheduler,
        this.limits.timeoutMs,
        this.limiter.run(read),
        () => new TranscriptTimeoutError(CLAUDE_ENGINE, operation, this.limits.timeoutMs),
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (error instanceof TranscriptTimeoutError) {
        this.logger.warn(
          {
            op: 'engine.transcript.read',
            layer: 'adapter',
            engine: CLAUDE_ENGINE,
            operation,
            ...context,
            durationMs,
          },
          'the transcript store did not answer in time',
        );
        throw error;
      }

      this.logger.error(
        {
          op: 'engine.transcript.read',
          layer: 'adapter',
          engine: CLAUDE_ENGINE,
          operation,
          ...context,
          durationMs,
          err: error,
        },
        'the transcript store failed',
      );
      throw new TranscriptUnavailableError(CLAUDE_ENGINE, operation);
    }
  }
}

/** What every SDK transcript call needs of a session: its id, and `dir` only when there is a `cwd`. */
function sdkCallOf(session: TranscriptSession): {
  claudeSessionId: string;
  options: { dir?: string };
} {
  const claudeSessionId = session.id.id;
  const dir = session.cwd ?? undefined;
  return { claudeSessionId, options: dir === undefined ? {} : { dir } };
}

/**
 * `SDKSessionInfo` → our session, or `null` for one this build cannot address.
 *
 * An id that is not a canonical UUID cannot be asked for again by a client, so it is left out of
 * the listing rather than shown as a row that opens onto a `400`.
 */
function toSession(info: SDKSessionInfo): TranscriptSession | null {
  const id = claudeConversation(info.sessionId);

  if (id === null) {
    return null;
  }

  return {
    id,
    summary: info.summary,
    cwd: info.cwd ?? null,
    gitBranch: info.gitBranch ?? null,
    createdAt: info.createdAt === undefined ? null : new Date(info.createdAt),
    lastModified: info.lastModified,
  };
}

/**
 * What the cache keeps for a tool that opened no subagent — so asking again costs nothing either.
 * One object, compared by identity.
 */
const NO_SUBAGENT: readonly TranscriptMessage[] = Object.freeze([]);

/**
 * The messages of [session]'s transcript, as the events of our contract — with the task list and the
 * pending-injection state followed across the whole conversation, by the same steps as live (plan
 * 28, B-22; plan 27, F5, B-17): one mapper for the whole read, never one per message, or a `Skill`
 * tool call and the compaction boundary would have nothing to prime the entry right after them with.
 */
function messagesOf(
  read: readonly SessionMessage[],
  session: TranscriptSession,
): TimedTranscriptMessage[] {
  const mapper = new SdkMessageMapper(session.cwd ?? '');
  return read.map((message) => toMessage(message, mapper));
}

/** One message of the transcript, as the events of our contract it amounts to. */
function toMessage(message: SessionMessage, mapper: SdkMessageMapper): TimedTranscriptMessage {
  const at = timestampOf(message);

  return {
    id: message.uuid,
    ...(at === undefined ? {} : { at }),
    events: historicalEvents(message, mapper).map((event) => ({
      type: event.type,
      payload: payloadRecord(event),
    })),
  };
}
