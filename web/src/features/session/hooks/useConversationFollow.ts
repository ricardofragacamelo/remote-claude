import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';
import { followTranscript } from '../services/transcript-follow.service';
import type { ConversationHistory } from './useConversationHistory';

/** What a screen reading a conversation shows about following it. */
export interface ConversationFollow {
  /** The server follows it now: what it gains arrives on its own. */
  readonly following: boolean;

  /**
   * Whether Claude seems to be working on it in another client — an inference from its last entry,
   * and only while it is followed: a screen that no longer hears cannot say it still works.
   */
  readonly working: boolean;

  /** Why it is not followed — refused (`TRANSCRIPT_FOLLOW_LIMIT`…), or the latest page unreadable. */
  readonly refusal: AppError | null;

  /**
   * Lets go of the subscription **now** — before the conversation becomes a live session here — and
   * holds it off until that is refused.
   */
  hold(): void;
}

/** What following needs from the history the screen reads. */
export type FollowedHistory = Pick<
  ConversationHistory,
  'summary' | 'base' | 'lastMessageId' | 'append' | 'restart'
>;

function subscribeVisibility(changed: () => void): () => void {
  document.addEventListener('visibilitychange', changed);
  return () => {
    document.removeEventListener('visibilitychange', changed);
  };
}

function pageVisible(): boolean {
  return document.visibilityState !== 'hidden';
}

/** Where following stands between subscriptions: free to follow, reading again, or stopped. */
type Phase = 'free' | 'rereading' | 'stopped';

/**
 * Follows the conversation a screen reads while it is on screen (plan 22, B-21).
 *
 * It follows from the `lastMessageId` the screen has, and hands what arrives to the history, which
 * folds it with the pages by the one reducer. A **reset** — the chain rewritten, the conversation
 * gone, a frame lost — reads the latest page again and follows from it. A hidden tab lets go and,
 * back on screen, follows again from the last entry it has (S-79); the socket that comes back follows
 * again by itself, from the same place (S-80). A refusal — the ceiling of follows, above all — is said,
 * and the conversation stays readable without following (S-81).
 *
 * @param continuation why the last attempt to continue the conversation here was refused, or `null` —
 *   after a {@link ConversationFollow.hold}, a new refusal is what lets it follow again
 */
export function useConversationFollow(
  conversationId: string,
  history: FollowedHistory,
  continuation: AppError | null,
): ConversationFollow {
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible);
  const [phase, setPhase] = useState<Phase>('free');
  const [seen, setSeen] = useState(visible);
  const [hold, setHold] = useState<{ readonly refusal: AppError | null } | null>(null);
  const held = hold !== null && (continuation === null || continuation === hold.refusal);
  const [following, setFollowing] = useState(false);
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<AppError | null>(null);
  const { base, append, restart } = history;
  const ready = history.summary !== null;

  // Read by the subscription when it begins — never a reason to begin again.
  const last = useRef(history.lastMessageId);
  const release = useRef<(() => void) | null>(null);

  useEffect(() => {
    last.current = history.lastMessageId;
  });

  // Coming back on screen lifts a stop: the person is looking again, and it is worth another try.
  if (seen !== visible) {
    setSeen(visible);
    setPhase(visible && phase === 'stopped' ? 'free' : phase);
  }

  useEffect(() => {
    if (held || !ready || !visible || phase !== 'free') {
      return undefined;
    }

    const stop = followTranscript(conversationId, last.current, {
      onFollowing: (activity) => {
        setFollowing(true);
        setRefusal(null);
        append(base, { events: [], lastMessageId: null, activity });
      },
      onAppended: (update) => {
        append(base, update);
        setWorking(update.working);
      },
      onInterrupted: () => {
        setFollowing(false);
        setWorking(false);
      },
      onReset: (reason) => {
        logger.debug({ op: 'history.follow', conversationId, reason }, 'reading it again');
        stop();
        setFollowing(false);
        setWorking(false);
        setPhase('rereading');
        void restart().then((failure) => {
          setRefusal(failure);
          setPhase(failure === null ? 'free' : 'stopped');
        });
      },
      onRefused: (error) => {
        setFollowing(false);
        setWorking(false);
        setRefusal(error);
        setPhase('stopped');
      },
    });
    release.current = stop;

    return () => {
      stop();
      release.current = null;
      setFollowing(false);
      setWorking(false);
    };
  }, [append, base, conversationId, held, phase, ready, restart, visible]);

  return {
    following,
    working: following && working,
    refusal,
    hold: () => {
      release.current?.();
      setHold({ refusal: continuation });
    },
  };
}
