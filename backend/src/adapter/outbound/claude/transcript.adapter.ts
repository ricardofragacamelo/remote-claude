import { Inject, Injectable } from '@nestjs/common';
import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import type { TranscriptStore } from '@application/transcript';
import {
  ClaudeSessionId,
  TranscriptTimeoutError,
  TranscriptUnavailableError,
} from '@domain/transcript';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { historicalEvents } from './sdk-message.mapper';
import { ReadLimiter, TRANSCRIPT_LIMITS, TranscriptCache } from './transcript-reads';
import type { TranscriptReadLimits } from './transcript-reads';
import { TRANSCRIPT_SDK } from './transcript-sdk';
import type { TranscriptSdk } from './transcript-sdk';

/** The three reads, named as they appear in the log and in the error a client receives. */
type TranscriptOperation = 'list sessions' | 'describe a session' | 'read messages';

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
export class AgentSdkTranscriptAdapter implements TranscriptStore {
  private readonly limiter: ReadLimiter;
  private readonly cache: TranscriptCache<readonly TranscriptMessage[]>;

  constructor(
    @Inject(TRANSCRIPT_SDK) private readonly sdk: TranscriptSdk,
    @Inject(TRANSCRIPT_LIMITS) private readonly limits: TranscriptReadLimits,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    this.limiter = new ReadLimiter(limits.concurrentReads);
    this.cache = new TranscriptCache(limits.cachedSessions);
  }

  async list(directory: string): Promise<readonly TranscriptSession[]> {
    // `includeWorktrees: false` stated, never left to the default — which is `true`, and would
    // bring in sessions from another path on disk than the one that cleared the allowlist.
    const infos = await this.call('list sessions', { directory }, () =>
      this.sdk.listSessions({ dir: directory, includeWorktrees: false }),
    );
    const sessions = infos.flatMap((info) => toSession(info) ?? []);

    this.logger.debug(
      {
        op: 'claude.transcript.list',
        layer: 'adapter',
        directory,
        sessions: sessions.length,
        unaddressable: infos.length - sessions.length,
      },
      'transcript sessions listed',
    );

    return sessions;
  }

  async find(id: ClaudeSessionId): Promise<TranscriptSession | null> {
    const info = await this.call('describe a session', { claudeSessionId: id.value }, () =>
      this.sdk.getSessionInfo(id.value),
    );
    const session = info === undefined ? null : toSession(info);

    this.logger.debug(
      {
        op: 'claude.transcript.find',
        layer: 'adapter',
        claudeSessionId: id.value,
        found: session !== null,
      },
      'transcript session described',
    );

    return session;
  }

  async messages(session: TranscriptSession): Promise<readonly TranscriptMessage[]> {
    const claudeSessionId = session.id.value;

    // No `limit` and no `offset`: they cut what comes back and not what the SDK does, which parses
    // the whole file either way. The whole conversation is read once and sliced from the cache.
    const { value, hit } = await this.cache.read(claudeSessionId, session.lastModified, async () =>
      (
        await this.call('read messages', { claudeSessionId }, () =>
          this.sdk.getSessionMessages(claudeSessionId),
        )
      ).map(toMessage),
    );

    this.logger.debug(
      {
        op: 'claude.transcript.messages',
        layer: 'adapter',
        claudeSessionId,
        lastModified: session.lastModified,
        messages: value.length,
        cache: hit ? 'hit' : 'miss',
      },
      'transcript messages read',
    );

    return value;
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
      { op: 'claude.transcript.read', layer: 'adapter', operation, ...context },
      'reading the transcript store',
    );

    try {
      return await this.withinDeadline(operation, this.limiter.run(read));
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (error instanceof TranscriptTimeoutError) {
        this.logger.warn(
          { op: 'claude.transcript.read', layer: 'adapter', operation, ...context, durationMs },
          'the transcript store did not answer in time',
        );
        throw error;
      }

      this.logger.error(
        {
          op: 'claude.transcript.read',
          layer: 'adapter',
          operation,
          ...context,
          durationMs,
          err: error,
        },
        'the transcript store failed',
      );
      throw new TranscriptUnavailableError(operation);
    }
  }

  private withinDeadline<T>(operation: TranscriptOperation, read: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cancel = this.scheduler.after(this.limits.timeoutMs, () => {
        reject(new TranscriptTimeoutError(operation, this.limits.timeoutMs));
      });

      read.then(
        (value) => {
          cancel();
          resolve(value);
        },
        (error: unknown) => {
          cancel();
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}

/**
 * `SDKSessionInfo` → our session, or `null` for one this build cannot address.
 *
 * An id that is not a canonical UUID cannot be asked for again by a client, so it is left out of
 * the listing rather than shown as a row that opens onto a `400`.
 */
function toSession(info: SDKSessionInfo): TranscriptSession | null {
  const id = ClaudeSessionId.parse(info.sessionId);

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

/** One message of the transcript, as the events of our contract it amounts to. */
function toMessage(message: SessionMessage): TranscriptMessage {
  return { id: message.uuid, events: historicalEvents(message) };
}
