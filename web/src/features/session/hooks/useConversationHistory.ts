import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { usePagedQuery } from '@/shared/hooks/usePagedQuery';
import { logger } from '@/shared/logging/logger';
import { fetchHistoryPage } from '../services/history.service';
import { conversationFrom, SILENT } from '../services/live-session.service';
import type {
  ConversationSummary,
  HistoryEvent,
  HistoryPage,
  TranscriptUpdate,
} from '../types/history';
import type { Conversation } from '../types/live-session';

/** The keys of the history, in one place, so invalidating one is not an exercise in guessing. */
export const historyKeys = {
  all: ['history'] as const,
  pages: (conversationId: string) => [...historyKeys.all, 'pages', conversationId] as const,
};

/** What a screen gets: the conversation so far read, and the way to what came before. */
export interface ConversationHistory {
  readonly isLoading: boolean;
  readonly error: AppError | null;

  /**
   * What the conversation is: where it ran, where it came from — and what it is doing, as the most
   * recent word on it said: the follow's last update, or the latest page. `null` until the first page.
   */
  readonly summary: ConversationSummary | null;

  /** The pages and what following added after them, folded by the one reducer (B-03). */
  readonly conversation: Conversation;

  /** Whether anything was said before the oldest message on screen. */
  readonly hasEarlier: boolean;
  readonly isLoadingEarlier: boolean;
  readonly earlierError: AppError | null;

  loadEarlier(): void;

  /** Reads every earlier page, one after the other — what a search of the whole conversation needs. */
  loadEverything(): void;
  reload(): void;

  /**
   * The `lastMessageId` of the latest page — the entry what follows is added after (plan 22, B-22).
   * Reading the latest page again moves it, and what was added after the old one is let go: the page
   * has it now. `null` for a conversation with no entry, and before the first page.
   */
  readonly base: string | null;

  /** The last entry the screen has: of the last update followed, or else of the latest page. */
  readonly lastMessageId: string | null;

  /**
   * Adds what following brought after `base` — ignored when the latest page has moved on since the
   * follow that brought it began: the page already has it, and the follow begins again.
   */
  append(base: string | null, update: TranscriptUpdate): void;

  /**
   * Lets go of everything followed and reads the latest page again, alone — what a reset asks for.
   *
   * @returns why the page could not be read, or `null` when it was
   */
  restart(): Promise<AppError | null>;
}

/** What following added on top of the pages, and the page it was added after. */
interface Followed {
  readonly conversationId: string;
  readonly base: string | null;
  readonly events: readonly HistoryEvent[];
  readonly lastMessageId: string | null;
  readonly activity: ConversationSummary['activity'];
}

/** What was followed, while it still builds on `base` of the conversation on screen. */
function stillOn(
  followed: Followed | null,
  conversationId: string,
  base: string | null,
): Followed | null {
  return followed?.conversationId === conversationId && followed.base === base ? followed : null;
}

/**
 * What was followed, with one more update: after what was there when it builds on the same page, on
 * its own otherwise. An update that brings no entry keeps the same events — nothing to fold again.
 */
function extended(
  before: Followed | null,
  conversationId: string,
  base: string | null,
  update: TranscriptUpdate,
): Followed {
  const kept = stillOn(before, conversationId, base);
  const events = kept?.events ?? [];

  return {
    conversationId,
    base,
    events: update.events.length === 0 ? events : [...events, ...update.events],
    lastMessageId: update.lastMessageId ?? kept?.lastMessageId ?? null,
    activity: update.activity,
  };
}

/**
 * A conversation of the history, a page at a time, from the latest message backwards — and what
 * following it adds after the latest page (plan 22, B-22).
 *
 * Opening the same conversation again inside the stale window reads the cache and asks the network
 * nothing (S-16). The backend caches the expensive read as well, and for a different reason — the
 * SDK reparses the whole file on every call. Coming back to the tab is not a reason to read it
 * again: this is a detail, not a list; what changes while it is open arrives by following it.
 *
 * The pages arrive newest first and each is oldest first inside, so the conversation is the pages
 * reversed, flattened, then what was followed after them, all folded by the one reducer the live
 * stream uses (B-03). An earlier page goes **before** everything and what is followed **after**, so
 * reading one while the other arrives neither loses nor repeats a block (S-82).
 */
export function useConversationHistory(conversationId: string): ConversationHistory {
  const client = useQueryClient();
  const history = usePagedQuery({
    queryKey: historyKeys.pages(conversationId),
    fetchPage: (cursor) => fetchHistoryPage(conversationId, cursor),
    nextCursor: (page) => page.nextCursor,
    refetchOnWindowFocus: false,
  });

  const { pages } = history;
  const [everything, setEverything] = useState(false);
  const [followed, setFollowed] = useState<Followed | null>(null);
  const { hasMore, isLoadingMore, moreError, loadMore } = history;
  const latest = pages?.[0];
  const base = latest?.lastMessageId ?? null;

  // What was followed after a page the screen no longer has — or of another conversation — is gone.
  const current = latest === undefined ? null : stillOn(followed, conversationId, base);

  // One page after the other while everything was asked for; a failure stops it, and says so.
  useEffect(() => {
    if (everything && hasMore && !isLoadingMore && moreError === null) {
      loadMore();
    }
  }, [everything, hasMore, isLoadingMore, loadMore, moreError]);

  const events = current?.events;
  const conversation = useMemo(
    () =>
      pages === undefined
        ? SILENT
        : conversationFrom([
            ...[...pages].reverse().flatMap((page) => page.events),
            ...(events ?? []),
          ]),
    [pages, events],
  );

  const activity = current?.activity;
  const summary = useMemo(
    () => (latest === undefined ? null : { ...latest.conversation, ...(activity && { activity }) }),
    [latest, activity],
  );

  const append = useCallback(
    (from: string | null, update: TranscriptUpdate) => {
      setFollowed((before) => extended(before, conversationId, from, update));
    },
    [conversationId],
  );

  const restart = useCallback(async (): Promise<AppError | null> => {
    const queryKey = historyKeys.pages(conversationId);
    logger.debug({ op: 'history.restart', conversationId }, 'reading the latest page again');

    // Only the latest page is read again: an earlier one's cursor may name a chain that is gone.
    client.setQueryData<InfiniteData<HistoryPage, string | null>>(queryKey, (data) =>
      data === undefined
        ? data
        : { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
    );
    await client.refetchQueries({ queryKey, exact: true });
    setFollowed(null);

    const state = client.getQueryState<InfiniteData<HistoryPage, string | null>, AppError>(
      queryKey,
    );
    return state?.status === 'error' ? state.error : null;
  }, [client, conversationId]);

  return {
    isLoading: history.isLoading,
    error: history.error,
    summary,
    conversation,
    hasEarlier: history.hasMore,
    isLoadingEarlier: history.isLoadingMore,
    earlierError: history.moreError,
    loadEarlier: history.loadMore,
    loadEverything: () => {
      setEverything(true);
    },
    reload: history.reload,
    base,
    lastMessageId: current?.lastMessageId ?? base,
    append,
    restart,
  };
}
