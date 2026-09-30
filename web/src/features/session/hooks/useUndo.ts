import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { fetchCheckpoints, incompleteRewindOf, rewindFiles } from '../services/checkpoint.service';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { Checkpoint, RewindOutcome, UndoAvailability } from '../types/checkpoint';
import type { SessionStatus } from '../types/live-session';
import { useCommandRefusal } from './useCommandRefusal';

/** The keys of the undo points, in one place. */
export const checkpointKeys = {
  all: ['sessions', 'checkpoints'] as const,
  of: (sessionId: string) => [...checkpointKeys.all, sessionId] as const,
};

/** What the undo panel gets: the points, where the session stands, and the outcome of the last. */
export interface Undo {
  readonly availability: UndoAvailability;

  readonly checkpoints: readonly Checkpoint[];
  readonly isLoading: boolean;

  /** Why the points could not be read. */
  readonly error: AppError | null;

  /** An undo left and nothing has answered it yet. */
  readonly isRewinding: boolean;

  /** Why the last undo was refused — a turn running, a point that is not one, the session gone. */
  readonly refusal: AppError | null;

  /** The undo stopped short of some file. The outcome lists which; this says so in a sentence. */
  readonly incomplete: AppError | null;

  /** What the last undo of this session did, whoever asked for it. */
  readonly outcome: RewindOutcome | null;

  rewind(promptId: string): void;
  reload(): void;
}

/**
 * Undoing what a session wrote, with the reach shown before and the outcome after.
 *
 * The points are server data and live in the query cache, but they are **live** data: what undoing
 * to a point would do changes with every turn and with every edit made by hand. So they are never
 * fresh for long, and they are asked for again whenever a turn completes and whenever an undo
 * lands — the two moments the answer is known to have moved.
 *
 * An undo is refused while a turn is running (`SESSION_LOCKED`), and a screen that let somebody
 * press it anyway would be teaching them the button does not work. So the status decides first,
 * and the refusal is there for the race the status cannot see — the other device's undo.
 */
export function useUndo(sessionId: string): Undo {
  const store = liveSessionStoreOf(sessionId);
  const status = useStore(store, (state) => state.status);
  const outcome = useStore(store, (state) => state.lastRewind);
  const queryClient = useQueryClient();
  const availability = availabilityOf(status);
  const { error: refusal, isAwaiting, expect, inFlight, settle } = useCommandRefusal();
  const [incomplete, setIncomplete] = useState<AppError | null>(null);

  const query = useQuery<readonly Checkpoint[], AppError>({
    queryKey: checkpointKeys.of(sessionId),
    queryFn: () => fetchCheckpoints(sessionId),
    enabled: availability !== 'ended',
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // A turn that completed may have written files; an undo that landed certainly did. Watched on
  // the store rather than on a render, because what matters is the change, not the value.
  useEffect(
    () =>
      store.subscribe((state, previous) => {
        if (state.lastRewind !== previous.lastRewind) {
          settle();
        }

        if (state.lastTurn !== previous.lastTurn || state.lastRewind !== previous.lastRewind) {
          void queryClient.invalidateQueries({ queryKey: checkpointKeys.of(sessionId) });
        }
      }),
    [queryClient, sessionId, settle, store],
  );

  useEffect(
    () =>
      wsClient.observe((frame) => {
        const stoppedShort = incompleteRewindOf(frame, sessionId);

        if (stoppedShort !== null) {
          setIncomplete(stoppedShort);
        }
      }),
    [sessionId],
  );

  const rewind = useCallback(
    (promptId: string) => {
      // The button is disabled while one is in flight; this is what holds when two clicks land
      // inside one frame — the second would only be refused as `SESSION_LOCKED` by the first.
      if (inFlight()) {
        return;
      }

      setIncomplete(null);
      expect(rewindFiles(wsClient, sessionId, promptId));
    },
    [expect, inFlight, sessionId],
  );

  return {
    availability,
    checkpoints: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    isRewinding: isAwaiting,
    refusal,
    incomplete,
    outcome,
    rewind,
    reload: () => {
      void query.refetch();
    },
  };
}

/** A session that is doing something cannot be undone under; one that ended cannot be at all. */
function availabilityOf(status: SessionStatus): UndoAvailability {
  if (status === 'closed') {
    return 'ended';
  }

  return status === 'idle' ? 'ready' : 'busy';
}
