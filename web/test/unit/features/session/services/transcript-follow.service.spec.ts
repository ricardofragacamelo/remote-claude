import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import {
  createTranscriptFollows,
  followTranscript,
} from '@/features/session/services/transcript-follow.service';
import type {
  FollowTransport,
  TranscriptFollows,
  TranscriptFollowSubscriber,
} from '@/features/session/services/transcript-follow.service';
import type { ConnectionStatus } from '@/shared/api/ws-client';
import { said } from '../../../../support/history';
import { aLiveSocket } from '../../../../support/live-socket';

const CONVERSATION = '0f0e0d0c-0b0a-4908-8706-050403020100';
const AT = '2026-10-07T12:00:00.000Z';

/** A socket client a test drives: what it sent, and frames it is told arrived. */
class FakeTransport implements FollowTransport {
  readonly sent: { type: string; payload: Readonly<Record<string, unknown>>; id: string }[] = [];
  private status: ConnectionStatus = 'idle';
  private readonly listeners = new Set<(frame: Envelope) => void>();
  private readonly watchers = new Set<(status: ConnectionStatus) => void>();
  private next = 0;

  issue(type: string, payload: Readonly<Record<string, unknown>>): string | null {
    if (this.status !== 'ready') {
      return null;
    }

    this.next += 1;
    const id = `cmd-${String(this.next)}`;
    this.sent.push({ type, payload, id });
    return id;
  }

  command(type: string, payload: Readonly<Record<string, unknown>>): boolean {
    return this.issue(type, payload) !== null;
  }

  observe(listener: (frame: Envelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(watcher: (status: ConnectionStatus) => void): () => void {
    this.watchers.add(watcher);
    watcher(this.status);
    return () => this.watchers.delete(watcher);
  }

  move(status: ConnectionStatus): void {
    this.status = status;
    for (const watcher of this.watchers) watcher(status);
  }

  /** A frame arrived — loosely written: the service under test is what checks it. */
  receive(frame: Readonly<Record<string, unknown>>): void {
    const whole = { v: 1, id: 'srv', kind: 'event', type: 'x', ts: AT, ...frame } as Envelope;
    for (const listener of this.listeners) listener(whole);
  }

  lastSent(type: string) {
    return this.sent.findLast((frame) => frame.type === type);
  }

  /** Answers the last `transcript.follow` with the subscription `followId`. */
  following(followId: string, activity = 'activeElsewhere'): void {
    this.receive({
      kind: 'ack',
      type: 'transcript.following',
      correlationId: this.lastSent('transcript.follow')?.id,
      payload: { followId, conversationId: CONVERSATION, activity },
    });
  }

  appended(followId: string, seq: number, payload: Record<string, unknown> = {}): void {
    this.receive({
      kind: 'event',
      type: 'transcript.appended',
      seq,
      payload: {
        followId,
        conversationId: CONVERSATION,
        events: [],
        activity: 'activeElsewhere',
        working: false,
        ...payload,
      },
    });
  }
}

function aSubscriber() {
  return {
    onFollowing: vi.fn<TranscriptFollowSubscriber['onFollowing']>(),
    onAppended: vi.fn<TranscriptFollowSubscriber['onAppended']>(),
    onInterrupted: vi.fn<TranscriptFollowSubscriber['onInterrupted']>(),
    onReset: vi.fn<TranscriptFollowSubscriber['onReset']>(),
    onRefused: vi.fn<TranscriptFollowSubscriber['onRefused']>(),
  } satisfies TranscriptFollowSubscriber;
}

/** Plan 22, B-20 — following a conversation over the socket. */
describe('the follows of a socket client', () => {
  let transport: FakeTransport;
  let follows: TranscriptFollows;

  beforeEach(() => {
    transport = new FakeTransport();
    follows = createTranscriptFollows(transport);
    transport.move('ready');
  });

  it('follows from the lastMessageId of the page, and hands over what its subscription gained — S-74', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);

    expect(transport.lastSent('transcript.follow')?.payload).toEqual({
      conversationId: CONVERSATION,
      afterMessageId: 'u-41',
    });

    transport.following('t1');
    expect(subscriber.onFollowing).toHaveBeenCalledWith('activeElsewhere');

    transport.appended('t1', 1, {
      events: [said('m2', 'more')],
      lastMessageId: 'u-44',
      working: true,
    });

    expect(subscriber.onAppended).toHaveBeenCalledWith({
      events: [said('m2', 'more')],
      lastMessageId: 'u-44',
      activity: 'activeElsewhere',
      working: true,
    });
  });

  it('follows a conversation with no entry from its start', () => {
    follows.follow(CONVERSATION, null, aSubscriber());

    expect(transport.lastSent('transcript.follow')?.payload).toEqual({
      conversationId: CONVERSATION,
    });
  });

  it('ignores what belongs to another subscription, and a frame applied already — S-75', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);
    transport.following('t1');

    transport.appended('t-other', 1, { events: [said('x', 'not mine')] });
    transport.appended('t1', 1, { events: [said('m2', 'mine')] });
    transport.appended('t1', 1, { events: [said('m2', 'mine')] });
    // Not a frame of the contract: dropped before anything reads it.
    transport.receive({
      kind: 'event',
      type: 'transcript.appended',
      seq: 2,
      payload: { followId: 't1' },
    });

    expect(subscriber.onAppended).toHaveBeenCalledTimes(1);
    expect(subscriber.onAppended).toHaveBeenCalledWith(
      expect.objectContaining({ events: [said('m2', 'mine')] }),
    );
  });

  it('lets go of a subscription with a hole in its seq, and asks for a reset — S-76', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);
    transport.following('t1');
    transport.appended('t1', 1);

    transport.appended('t1', 3, { events: [said('m4', 'after a hole')] });

    expect(subscriber.onReset).toHaveBeenCalledWith('lost');
    expect(subscriber.onAppended).toHaveBeenCalledTimes(1);
    expect(transport.lastSent('transcript.unfollow')?.payload).toEqual({ followId: 't1' });

    // Nothing more of it is heard, and the socket coming back does not follow it again.
    transport.appended('t1', 4);
    transport.move('reconnecting');
    transport.move('ready');
    expect(subscriber.onAppended).toHaveBeenCalledTimes(1);
    expect(transport.sent.filter((frame) => frame.type === 'transcript.follow')).toHaveLength(1);
  });

  it('tells the reset the server sent, and has nothing to unfollow after it', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);
    transport.following('t1');

    transport.receive({
      kind: 'event',
      type: 'transcript.reset',
      seq: 1,
      payload: { followId: 't1', conversationId: CONVERSATION, reason: 'rewritten' },
    });
    transport.receive({
      kind: 'event',
      type: 'transcript.reset',
      seq: 1,
      payload: { followId: 't-other', conversationId: CONVERSATION, reason: 'gone' },
    });
    transport.receive({ kind: 'event', type: 'transcript.reset', payload: { followId: 't1' } });

    expect(subscriber.onReset).toHaveBeenCalledTimes(1);
    expect(subscriber.onReset).toHaveBeenCalledWith('rewritten');
    expect(transport.lastSent('transcript.unfollow')).toBeUndefined();
  });

  it('says a refusal, translated by its key, and never follows it again by itself', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);

    transport.receive({
      kind: 'error',
      type: 'error',
      correlationId: transport.lastSent('transcript.follow')?.id,
      traceId: 'trace-limit',
      payload: {
        code: 'TRANSCRIPT_FOLLOW_LIMIT',
        messageKey: 'transcript.error.followLimit',
        params: { limit: 4, scope: 'connection' },
      },
    });
    // A refusal of somebody else's command is not this one's.
    transport.receive({ kind: 'error', type: 'error', correlationId: 'cmd-99', payload: {} });

    expect(subscriber.onRefused).toHaveBeenCalledTimes(1);
    expect(subscriber.onRefused.mock.calls[0]?.[0]).toMatchObject({
      code: 'TRANSCRIPT_FOLLOW_LIMIT',
      messageKey: 'transcript.error.followLimit',
      params: { limit: 4, scope: 'connection' },
      traceId: 'trace-limit',
    });

    transport.move('reconnecting');
    transport.move('ready');
    expect(transport.sent.filter((frame) => frame.type === 'transcript.follow')).toHaveLength(1);
  });

  it('follows again when the socket comes back, from the last entry it delivered — S-80', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);
    transport.following('t1');
    transport.appended('t1', 1, { events: [said('m2', 'more')], lastMessageId: 'u-44' });
    transport.appended('t1', 2, { lastMessageId: undefined });

    transport.move('reconnecting');
    expect(subscriber.onInterrupted).toHaveBeenCalledTimes(1);
    transport.move('reconnecting');

    transport.move('ready');
    expect(transport.lastSent('transcript.follow')?.payload).toEqual({
      conversationId: CONVERSATION,
      afterMessageId: 'u-44',
    });

    // A new subscription: its seq starts from 1 again.
    transport.following('t2');
    transport.appended('t2', 1, { events: [said('m3', 'after it came back')] });

    expect(subscriber.onFollowing).toHaveBeenCalledTimes(2);
    expect(subscriber.onAppended).toHaveBeenLastCalledWith(
      expect.objectContaining({ events: [said('m3', 'after it came back')] }),
    );
  });

  it('sends the follow once the socket is ready, and says nothing went while it never was', () => {
    transport.move('reconnecting');
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);

    expect(transport.lastSent('transcript.follow')).toBeUndefined();
    transport.move('closed');
    expect(subscriber.onInterrupted).not.toHaveBeenCalled();

    transport.move('ready');
    expect(transport.lastSent('transcript.follow')?.payload).toMatchObject({
      afterMessageId: 'u-41',
    });
  });

  it('unfollows on release, once however often it is released', () => {
    const subscriber = aSubscriber();
    const release = follows.follow(CONVERSATION, 'u-41', subscriber);
    transport.following('t1');

    release();
    release();

    expect(transport.sent.filter((frame) => frame.type === 'transcript.unfollow')).toEqual([
      expect.objectContaining({ payload: { followId: 't1' } }),
    ]);
    transport.appended('t1', 1);
    expect(subscriber.onAppended).not.toHaveBeenCalled();
  });

  it('unfollows a subscription released before its answer came, as the answer arrives', () => {
    const subscriber = aSubscriber();
    const release = follows.follow(CONVERSATION, 'u-41', subscriber);
    const asked = transport.lastSent('transcript.follow')?.id;

    release();
    expect(transport.lastSent('transcript.unfollow')).toBeUndefined();

    transport.receive({
      kind: 'ack',
      type: 'transcript.following',
      correlationId: asked,
      payload: { followId: 't1', conversationId: CONVERSATION, activity: 'idle' },
    });

    expect(transport.lastSent('transcript.unfollow')?.payload).toEqual({ followId: 't1' });
    expect(subscriber.onFollowing).not.toHaveBeenCalled();
  });

  it('owes nothing to a released follow that was refused', () => {
    const subscriber = aSubscriber();
    const release = follows.follow(CONVERSATION, 'u-41', subscriber);
    const asked = transport.lastSent('transcript.follow')?.id;
    release();

    transport.receive({
      kind: 'error',
      type: 'error',
      correlationId: asked,
      payload: { code: 'NOT_FOUND', messageKey: 'transcript.error.notFound' },
    });

    expect(subscriber.onRefused).not.toHaveBeenCalled();
    expect(transport.lastSent('transcript.unfollow')).toBeUndefined();
  });

  it('ignores an answer it did not ask for, and one that is not of the contract', () => {
    const subscriber = aSubscriber();
    follows.follow(CONVERSATION, 'u-41', subscriber);

    transport.receive({
      kind: 'ack',
      type: 'transcript.following',
      correlationId: 'cmd-99',
      payload: { followId: 't9', conversationId: CONVERSATION, activity: 'idle' },
    });
    transport.receive({
      kind: 'ack',
      type: 'transcript.following',
      correlationId: transport.lastSent('transcript.follow')?.id,
      payload: { conversationId: CONVERSATION },
    });

    expect(subscriber.onFollowing).not.toHaveBeenCalled();
  });

  it('forgets the answers a dropped socket owed', () => {
    const release = follows.follow(CONVERSATION, 'u-41', aSubscriber());
    const asked = transport.lastSent('transcript.follow')?.id;
    release();

    transport.move('reconnecting');
    transport.move('ready');
    transport.receive({
      kind: 'ack',
      type: 'transcript.following',
      correlationId: asked,
      payload: { followId: 't1', conversationId: CONVERSATION, activity: 'idle' },
    });

    expect(transport.lastSent('transcript.unfollow')).toBeUndefined();
  });
});

describe('followTranscript — the one socket client of the app', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follows over the real client', () => {
    const socket = aLiveSocket();
    socket.connect();

    const release = followTranscript(CONVERSATION, 'u-41', aSubscriber());

    expect(socket.lastSent('transcript.follow')?.['payload']).toEqual({
      conversationId: CONVERSATION,
      afterMessageId: 'u-41',
    });
    release();
    socket.close();
  });
});
