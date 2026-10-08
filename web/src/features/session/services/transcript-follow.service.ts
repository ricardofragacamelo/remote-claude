import {
  isTranscriptAppendedPayload,
  isTranscriptFollowingPayload,
  isTranscriptResetPayload,
} from '@remote-claude/contracts';
import type { Envelope } from '@remote-claude/contracts';

import { toAppError } from '@/shared/api/errors';
import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { routeFrames, watchReadiness } from '@/shared/api/socket-subscriptions';
import type { SubscriptionTransport } from '@/shared/api/socket-subscriptions';
import { logger } from '@/shared/logging/logger';
import { toHistoryEvents } from './history.service';
import type { ConversationActivity, TranscriptUpdate } from '../types/history';

/** One update of a followed conversation: what it gained, and whether Claude seems to be working. */
export interface FollowUpdate extends TranscriptUpdate {
  /**
   * Whether Claude seems to be working on it in another client — an **inference** from the last
   * entry, never a fact the transcript records (plan 22, D-12).
   */
  readonly working: boolean;
}

/**
 * Why a subscription ended without anybody here asking: the chain was `rewritten` (a rewind, a
 * compaction), the conversation is `gone`, or a frame of it was `lost` on the way — a hole in its
 * `seq`. Each one means the same to the screen: read the latest page again and follow anew.
 */
export type FollowEndReason = 'rewritten' | 'gone' | 'lost';

/** What a screen needs from following one conversation. */
export interface TranscriptFollowSubscriber {
  /** The server follows it — again, after a reconnect. `activity` is what it is doing now. */
  onFollowing(activity: ConversationActivity): void;

  /** What it gained, oldest first. An update with no events says only that the state changed. */
  onAppended(update: FollowUpdate): void;

  /** The socket went: nothing arrives until it is back, and then the follow is sent again. */
  onInterrupted(): void;

  /** The subscription ended and cannot go on from where the screen is (see {@link FollowEndReason}). */
  onReset(reason: FollowEndReason): void;

  /** `transcript.follow` was refused — `TRANSCRIPT_FOLLOW_LIMIT`, `TRANSCRIPT_FOLLOW_LIVE_HERE`, `NOT_FOUND`. */
  onRefused(error: AppError): void;
}

/** The part of the socket client following needs. */
export type FollowTransport = SubscriptionTransport;

/** The followed conversations of one socket client. */
export interface TranscriptFollows {
  /**
   * Follows `conversationId` for `subscriber` from `afterMessageId` — the `lastMessageId` of the page
   * it read, `null` for a conversation with no entry — until the release.
   *
   * @returns the release — idempotent
   */
  follow(
    conversationId: string,
    afterMessageId: string | null,
    subscriber: TranscriptFollowSubscriber,
  ): () => void;
}

/** One subscription, and where it stands. */
interface Followed {
  readonly conversationId: string;
  readonly subscriber: TranscriptFollowSubscriber;

  /** The last entry it has — what the follow is sent again from after a reconnect. */
  after: string | null;

  /** The id of the `transcript.follow` frame waiting for its answer. */
  pending: string | null;
  followId: string | null;
  lastSeq: number;

  /** Ended by the server, refused or released: never sent again by a reconnect. */
  over: boolean;
}

/**
 * The `transcript.*` subscriptions of one socket client (plan 22, B-20), in the mould of the watched
 * folders.
 *
 * It owns the bookkeeping of the stream and nothing else: which `followId` each subscription is, its
 * `seq` — its own, from 1, never a session's —, the follow sent again when the socket comes back, from
 * the last entry it delivered, and the unfollow of a subscription whose answer had not arrived yet when
 * it was released. **A `seq` that skips is a lost frame**: the subscription is let go and the subscriber
 * told to read again, never handed a patch with a hole in it.
 */
export function createTranscriptFollows(transport: FollowTransport): TranscriptFollows {
  const followed = new Set<Followed>();

  /** Answers still owed to a follow released before they came; unfollowed as they arrive. */
  const abandoned = new Set<string>();
  let ready = false;

  function send(entry: Followed): void {
    entry.pending = transport.issue('transcript.follow', {
      conversationId: entry.conversationId,
      ...(entry.after === null ? {} : { afterMessageId: entry.after }),
    });
    logger.debug(
      { op: 'transcript.follow', conversationId: entry.conversationId, after: entry.after },
      'conversation follow requested',
    );
  }

  function byFollowId(followId: unknown): Followed | undefined {
    return [...followed].find((entry) => entry.followId === followId);
  }

  function answering(frame: Envelope): Followed | undefined {
    return [...followed].find((entry) => entry.pending === frame.correlationId);
  }

  /** Ends a subscription here, telling the server when it still holds it. */
  function end(entry: Followed, unfollow: boolean): void {
    if (unfollow && entry.followId !== null) {
      transport.command('transcript.unfollow', { followId: entry.followId });
    }

    entry.over = true;
    entry.followId = null;
    entry.pending = null;
  }

  function answered(frame: Envelope): void {
    const payload = frame.payload;

    if (!isTranscriptFollowingPayload(payload)) {
      return;
    }

    if (frame.correlationId !== undefined && abandoned.delete(frame.correlationId)) {
      transport.command('transcript.unfollow', { followId: payload.followId });
      return;
    }

    const entry = answering(frame);

    if (entry === undefined) {
      return;
    }

    entry.pending = null;
    entry.followId = payload.followId;
    entry.lastSeq = 0;
    logger.debug(
      { op: 'transcript.follow', conversationId: entry.conversationId, followId: payload.followId },
      'conversation followed',
    );
    entry.subscriber.onFollowing(payload.activity);
  }

  /** The `seq` of a frame of the subscription: `true` when it is the next one. */
  function inOrder(entry: Followed, frame: Envelope): boolean {
    const seq = frame.seq ?? 0;

    if (seq > entry.lastSeq + 1) {
      logger.warn(
        { op: 'transcript.follow', conversationId: entry.conversationId, seq, last: entry.lastSeq },
        'conversation follow lost a frame',
      );
      end(entry, true);
      entry.subscriber.onReset('lost');
      return false;
    }

    entry.lastSeq = seq;
    return true;
  }

  function appended(frame: Envelope): void {
    const payload = frame.payload;

    if (!isTranscriptAppendedPayload(payload)) {
      return;
    }

    const entry = byFollowId(payload.followId);

    // Another subscription's, or a frame already applied: a redelivery changes nothing.
    if (entry === undefined || (frame.seq ?? 0) <= entry.lastSeq || !inOrder(entry, frame)) {
      return;
    }

    const lastMessageId = payload.lastMessageId ?? null;
    entry.after = lastMessageId ?? entry.after;
    logger.debug(
      {
        op: 'transcript.follow',
        conversationId: entry.conversationId,
        seq: frame.seq,
        events: payload.events.length,
        activity: payload.activity,
        working: payload.working,
      },
      'conversation update received',
    );
    entry.subscriber.onAppended({
      events: toHistoryEvents(payload.events),
      lastMessageId,
      activity: payload.activity,
      working: payload.working,
    });
  }

  function reset(frame: Envelope): void {
    const payload = frame.payload;

    if (!isTranscriptResetPayload(payload)) {
      return;
    }

    const entry = byFollowId(payload.followId);

    if (entry === undefined) {
      return;
    }

    logger.info(
      { op: 'transcript.follow', conversationId: entry.conversationId, reason: payload.reason },
      'conversation follow reset',
    );
    // The reset is the last frame of the subscription: the server holds nothing to unfollow.
    end(entry, false);
    entry.subscriber.onReset(payload.reason);
  }

  function refused(frame: Envelope): void {
    // A refusal of a follow released before its answer: nothing to unfollow, nobody to tell.
    if (frame.correlationId !== undefined && abandoned.delete(frame.correlationId)) {
      return;
    }

    const entry = answering(frame);

    if (entry === undefined) {
      return;
    }

    const error = toAppError({ error: frame.payload }, frame.traceId ?? frame.id);
    logger.warn(
      { op: 'transcript.follow', conversationId: entry.conversationId, code: error.code },
      'conversation follow refused',
    );
    end(entry, false);
    entry.subscriber.onRefused(error);
  }

  routeFrames(
    transport,
    {
      'transcript.following': answered,
      'transcript.appended': appended,
      'transcript.reset': reset,
    },
    refused,
  );

  watchReadiness(transport, (nowReady) => {
    ready = nowReady;
    // A subscription dies with its socket, and the answers it owed die with it too. There is no
    // replay: the follow is sent again, from the last entry each one delivered.
    abandoned.clear();

    for (const entry of followed) {
      if (entry.over) {
        continue;
      }

      const wasFollowing = entry.followId !== null || entry.pending !== null;
      entry.pending = null;
      entry.followId = null;

      if (ready) {
        send(entry);
      } else if (wasFollowing) {
        entry.subscriber.onInterrupted();
      }
    }
  });

  return {
    follow(conversationId, afterMessageId, subscriber) {
      const entry: Followed = {
        conversationId,
        subscriber,
        after: afterMessageId,
        pending: null,
        followId: null,
        lastSeq: 0,
        over: false,
      };

      followed.add(entry);

      if (ready) {
        send(entry);
      }

      return () => {
        if (!followed.delete(entry)) {
          return;
        }

        if (entry.pending !== null) {
          abandoned.add(entry.pending);
        }

        end(entry, true);
        logger.debug({ op: 'transcript.follow', conversationId }, 'conversation follow released');
      };
    },
  };
}

/** The follows of the one socket client, made on first use. */
let shared: TranscriptFollows | null = null;

/**
 * Follows a conversation of the history that this backend does not run, while the screen reads it
 * (`transcript.follow`, plan 22, D-02).
 *
 * @param afterMessageId the `lastMessageId` of the latest page read, or of the last update
 * @returns the release — idempotent
 */
export function followTranscript(
  conversationId: string,
  afterMessageId: string | null,
  subscriber: TranscriptFollowSubscriber,
): () => void {
  shared ??= createTranscriptFollows(wsClient);
  return shared.follow(conversationId, afterMessageId, subscriber);
}
