import { beforeEach, describe, expect, it } from 'vitest';

import { FollowTranscriptUseCase } from '@application/transcript';
import type {
  FollowObserver,
  FollowResetReason,
  FollowSink,
  FollowUpdate,
} from '@application/transcript';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import {
  ClaudeSessionId,
  TranscriptFollowLimitError,
  TranscriptFollowLiveHereError,
  TranscriptNotFoundError,
  TranscriptUnavailableError,
} from '@domain/transcript';
import type { TranscriptMessage, TranscriptSession } from '@domain/transcript';
import { WorkspacePath } from '@domain/workspace';
import { OWNER } from '../../../support/builders/workspace.builder';
import {
  aTranscriptAudience,
  aTranscriptSession,
  conversationId,
  noQuestionRecords,
  someMessages,
} from '../../../support/builders/transcript.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemorySessionOriginRepository } from '../../../support/fakes/in-memory-session-origin.repository';
import { InMemoryTranscriptStore } from '../../../support/fakes/in-memory-transcript.store';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const owner = UserId.create(OWNER);
const WRITTEN = 1_758_800_000_000;
const settings = { activeMs: 1_000, idleMs: 10_000, maxPerConnection: 4, max: 16 };

/** Every frame a subscription was sent, in order. */
class RecordingSink implements FollowSink {
  open = true;
  ended = false;
  readonly frames: (
    | { readonly kind: 'appended'; readonly followId: string; readonly update: FollowUpdate }
    | { readonly kind: 'reset'; readonly followId: string; readonly reason: FollowResetReason }
  )[] = [];

  appended(followId: string, _conversationId: string, update: FollowUpdate): void {
    this.frames.push({ kind: 'appended', followId, update });
  }

  reset(followId: string, _conversationId: string, reason: FollowResetReason): void {
    this.frames.push({ kind: 'reset', followId, reason });
  }

  end(): void {
    this.ended = true;
  }

  /** The ids of the entries the updates carried, in order. */
  get messageIds(): unknown[] {
    return this.frames.flatMap((frame) =>
      frame.kind === 'appended'
        ? frame.update.events.map((event) => event.payload['messageId'])
        : [],
    );
  }

  get last(): FollowUpdate | undefined {
    const appended = this.frames.filter((frame) => frame.kind === 'appended');
    const last = appended.at(-1);
    return last?.kind === 'appended' ? last.update : undefined;
  }
}

/** What the observer heard. */
class RecordingObserver implements FollowObserver {
  readonly looks: { conversationId: string; read: boolean; entries: number }[] = [];
  readonly failures: unknown[] = [];

  looked(conversationId: string, outcome: { read: boolean; entries: number }): void {
    this.looks.push({ conversationId, ...outcome });
  }

  failed(_conversationId: string, error: unknown): void {
    this.failures.push(error);
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A tool call left open: the turn goes on. */
const toolCall: TranscriptMessage = {
  id: 't1',
  events: [
    {
      type: 'message.completed',
      payload: { messageId: 'a', role: 'assistant', content: [{ type: 'tool_use' }] },
    },
    { type: 'tool.started', payload: { toolUseId: 'x', toolName: 'Bash', input: {} } },
  ],
};

describe('FollowTranscriptUseCase — plan 22, B-16', () => {
  let store: InMemoryTranscriptStore;
  let scheduler: ManualScheduler;
  let clock: FixedClock;
  let observer: RecordingObserver;
  let live: string | null;
  let origins: InMemorySessionOriginRepository;
  let follower: FollowTranscriptUseCase;

  const session = (n = 1, overrides: Partial<Omit<TranscriptSession, 'id'>> = {}) =>
    aTranscriptSession({ id: n, lastModified: WRITTEN, ...overrides });

  beforeEach(() => {
    store = new InMemoryTranscriptStore()
      .add('/srv/projects/app', session(1), someMessages(3))
      .add('/srv/projects/app', session(2), someMessages(1));
    scheduler = new ManualScheduler();
    clock = new FixedClock(new Date(WRITTEN + 1_000));
    observer = new RecordingObserver();
    live = null;
    origins = new InMemorySessionOriginRepository();
    follower = new FollowTranscriptUseCase(
      store,
      aTranscriptAudience({ origins, clock, live: { liveSessionOf: () => live } }),
      scheduler,
      new SequentialIds(),
      settings,
      observer,
      noQuestionRecords(),
    );
  });

  /** Follows a conversation and lets its first update go, as the gateway does after the ack. */
  async function follow(
    options: { n?: number; after?: string | null; connection?: string; sink?: RecordingSink } = {},
  ): Promise<{ sink: RecordingSink; followId: string }> {
    const sink = options.sink ?? new RecordingSink();
    const following = await follower.follow({
      connectionId: options.connection ?? 'c1',
      userId: owner,
      conversationId: ClaudeSessionId.create(conversationId(options.n ?? 1)),
      afterMessageId: options.after === undefined ? 'm1' : options.after,
      sink,
    });

    following.start();
    await settle();
    return { sink, followId: following.followId };
  }

  /** The conversation is written: new entries, a new version. */
  function write(messages: readonly TranscriptMessage[], at = WRITTEN + 5_000, n = 1): void {
    store.rewrite(conversationId(n), messages, at);
    clock.set(new Date(at + 1_000));
  }

  /** The next tick runs, and whatever it sends is sent. */
  async function tick(): Promise<void> {
    scheduler.fire();
    await settle();
  }

  it('acks with the activity, then sends everything after the entry — S-51', async () => {
    const sink = new RecordingSink();
    const following = await follower.follow({
      connectionId: 'c1',
      userId: owner,
      conversationId: ClaudeSessionId.create(conversationId(1)),
      afterMessageId: 'm1',
      sink,
    });

    expect(following).toMatchObject({
      followId: 't_01J00000000000000000000001',
      activity: 'activeElsewhere',
    });
    // Nothing before the ack went out (S-65).
    await settle();
    expect(sink.frames).toEqual([]);

    following.start();
    await settle();

    expect(sink.messageIds).toEqual(['m2', 'm3']);
    expect(sink.last).toMatchObject({
      lastMessageId: 'm3',
      activity: 'activeElsewhere',
    });
  });

  it('sends the first update even with nothing new, so the screen learns `working` — S-51', async () => {
    store.rewrite(conversationId(1), [...someMessages(1), toolCall], WRITTEN);
    const { sink } = await follow({ after: 't1' });

    expect(sink.frames).toHaveLength(1);
    expect(sink.last).toMatchObject({ events: [], lastMessageId: 't1', working: true });
  });

  it('sends everything of a conversation that was empty when it was read — S-42', async () => {
    const { sink } = await follow({ after: null });

    expect(sink.messageIds).toEqual(['m1', 'm2', 'm3']);
  });

  it('looks without reading while nothing was written — S-52', async () => {
    const { sink } = await follow();
    const reads = store.reads;

    await tick();
    await tick();

    expect(store.reads).toBe(reads);
    expect(sink.frames).toHaveLength(1);
    expect(observer.looks.at(-1)).toMatchObject({ read: false, entries: 3 });
  });

  it('reads once what was written, and sends only that, in order — S-53, S-63', async () => {
    const { sink } = await follow();
    const reads = store.reads;

    write(someMessages(4));
    await tick();
    write(someMessages(5), WRITTEN + 6_000);
    await tick();

    expect(store.reads).toBe(reads + 2);
    expect(sink.messageIds).toEqual(['m2', 'm3', 'm4', 'm5']);
  });

  it('looks once for every follower of a conversation, and tells each — S-54', async () => {
    const tabs = await Promise.all([
      follow({ connection: 'tab-1' }),
      follow({ connection: 'tab-2' }),
      follow({ connection: 'phone', after: 'm2' }),
    ]);
    const reads = store.reads;

    write(someMessages(4));
    await tick();

    expect(store.reads).toBe(reads + 1);
    expect(scheduler.armed).toBe(1);
    expect(tabs.map(({ sink }) => sink.messageIds.at(-1))).toEqual(['m4', 'm4', 'm4']);
    expect(follower.followedConversations).toBe(1);
  });

  it('resets a follower whose entry the chain lost, and stops — S-55', async () => {
    const { sink } = await follow();

    write(someMessages(2, 'c'));
    await tick();

    expect(sink.frames.at(-1)).toMatchObject({ kind: 'reset', reason: 'rewritten' });
    expect(sink.ended).toBe(true);
    expect(follower.followedConversations).toBe(0);
    expect(scheduler.armed).toBe(0);
  });

  it('resets every follower of a conversation that is gone — S-56', async () => {
    const { sink } = await follow();

    store.remove(conversationId(1));
    await tick();

    expect(sink.frames.at(-1)).toMatchObject({ kind: 'reset', reason: 'gone' });
  });

  it('looks every second while active elsewhere, every ten at rest, and back — S-57', async () => {
    await follow();
    expect(scheduler.delays.at(-1)).toBe(1_000);

    clock.advance(200_000);
    await tick();
    expect(scheduler.delays.at(-1)).toBe(10_000);

    write(someMessages(4), WRITTEN + 300_000);
    await tick();
    expect(scheduler.delays.at(-1)).toBe(1_000);
  });

  it('says when the window passed, with nothing new — S-48, S-85', async () => {
    store.rewrite(conversationId(1), [...someMessages(1), toolCall], WRITTEN);
    const { sink } = await follow({ after: 't1' });

    clock.advance(200_000);
    await tick();

    expect(sink.last).toMatchObject({ events: [], activity: 'idle', working: false });
  });

  it('refuses a conversation a live session of the caller holds — S-58', async () => {
    live = 'ses_live';

    const refusal = await follow().catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(TranscriptFollowLiveHereError);
    expect(refusal).toMatchObject({ params: { liveSessionId: 'ses_live' } });
    expect(follower.subscriptions).toBe(0);
  });

  it('logs a failed look, sends nothing, and tries again on the next — S-59', async () => {
    const { sink } = await follow();
    const failing = store.find.bind(store);
    let fails = true;
    store.find = (id) =>
      fails ? Promise.reject(new TranscriptUnavailableError('describe a session')) : failing(id);

    await tick();
    expect(observer.failures).toHaveLength(1);
    expect(sink.frames).toHaveLength(1);
    expect(scheduler.armed).toBe(1);

    fails = false;
    write(someMessages(4));
    await tick();
    expect(sink.messageIds.at(-1)).toBe('m4');
  });

  it('answers a conversation the caller does not read as a missing one — S-60', async () => {
    await origins.record({
      claudeSessionId: ClaudeSessionId.create(conversationId(1)),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: UserId.create('auth|stranger'),
      workspace: WorkspacePath.create('/srv/projects/app'),
      openedAt: new Date(0),
    });

    await expect(follow()).rejects.toBeInstanceOf(TranscriptNotFoundError);
    await expect(follow({ n: 99 })).rejects.toBeInstanceOf(TranscriptNotFoundError);
  });

  it('tells a follower the conversation is gone once a read no longer lets them see it — S-60', async () => {
    const { sink } = await follow();

    await origins.record({
      claudeSessionId: ClaudeSessionId.create(conversationId(1)),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      openedBy: UserId.create('auth|stranger'),
      workspace: WorkspacePath.create('/srv/projects/app'),
      openedAt: new Date(0),
    });
    write(someMessages(4));
    await tick();

    expect(sink.frames.at(-1)).toMatchObject({ kind: 'reset', reason: 'gone' });
  });

  it('lets a connection follow four, and refuses the fifth — S-61', async () => {
    for (let n = 1; n <= 4; n += 1) {
      store.add('/srv/projects/app', session(10 + n));
      await follow({ n: 10 + n, after: null });
    }

    const refusal = await follow({ n: 1 }).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(TranscriptFollowLimitError);
    expect(refusal).toMatchObject({ params: { limit: 4, scope: 'connection' } });
  });

  it('lets the server follow sixteen conversations, refuses the seventeenth, and frees a place — S-62', async () => {
    for (let n = 1; n <= 16; n += 1) {
      store.add('/srv/projects/app', session(100 + n));
      await follow({ n: 100 + n, after: null, connection: `c${String(n)}` });
    }
    store.add('/srv/projects/app', session(200));

    const refusal = await follow({ n: 200, after: null, connection: 'late' }).catch(
      (error: unknown) => error,
    );
    expect(refusal).toMatchObject({ params: { limit: 16, scope: 'server' } });
    // A conversation already followed still takes another follower.
    await follow({ n: 101, after: null, connection: 'late' });

    follower.release('c2');
    await follow({ n: 200, after: null, connection: 'late' });
    expect(follower.followedConversations).toBe(16);
  });

  it('gives the same entries to the same follow twice — S-64', async () => {
    const first = await follow({ after: 'm1' });
    const second = await follow({ after: 'm1', connection: 'c2' });

    expect(second.sink.messageIds).toEqual(first.sink.messageIds);
  });

  it('forgets a subscription unfollowed, and one it never had — S-66', async () => {
    const { followId, sink } = await follow();

    expect(follower.unfollow('c1', followId)).toBe(true);
    expect(follower.unfollow('c1', followId)).toBe(false);
    expect(follower.unfollow('other', 'nope')).toBe(false);
    expect(sink.ended).toBe(true);
    expect(scheduler.armed).toBe(0);
  });

  it('releases every subscription of a connection that went, and stops their ticks — S-67', async () => {
    await follow();
    await follow({ n: 2, after: null });
    await follow({ connection: 'c2' });

    expect(follower.release('c1')).toBe(2);
    expect(follower.followedConversations).toBe(1);
    expect(follower.release('c1')).toBe(0);
  });

  it('drops a subscription whose socket went before the ack', async () => {
    const sink = new RecordingSink();
    const following = await follower.follow({
      connectionId: 'c1',
      userId: owner,
      conversationId: ClaudeSessionId.create(conversationId(1)),
      afterMessageId: 'm1',
      sink,
    });

    sink.open = false;
    following.start();
    await settle();

    expect(sink.frames).toEqual([]);
    expect(follower.subscriptions).toBe(0);
  });

  it('holds a follower not yet acked out of a look the others asked for', async () => {
    const early = await follow();
    const sink = new RecordingSink();
    const late = await follower.follow({
      connectionId: 'c2',
      userId: owner,
      conversationId: ClaudeSessionId.create(conversationId(1)),
      afterMessageId: 'm1',
      sink,
    });

    write(someMessages(4));
    await tick();
    expect(sink.frames).toEqual([]);
    expect(early.sink.messageIds.at(-1)).toBe('m4');

    late.start();
    await settle();
    expect(sink.messageIds).toEqual(['m2', 'm3', 'm4']);
  });
});
