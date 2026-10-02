import { useCallback, useEffect, useRef } from 'react';

import type { AppError } from '@/shared/api/errors';
import { wsClient } from '@/shared/api/ws';
import { notify } from '@/shared/lib/notify';
import { nameOf } from '../lib/diff-sides';
import { rejectFiles, rejectHunk, restoreChange } from '../services/changes.service';
import { liveSessionStoreOf } from '../store/live-session.store';
import type { FileChange } from '../types/changes';
import { useCommandRefusal } from './useCommandRefusal';

/** What rejecting gets: the four acts, and whether one is in flight or was refused. */
export interface Rejections {
  readonly isRejecting: boolean;

  /** Why the last one was refused — a turn running, a revision that moved, nothing to undo. */
  readonly refusal: AppError | null;

  /** Puts one file back the way it was before the session (B-30). */
  rejectFile(file: FileChange): void;

  /** Puts one hunk back, against the revision the hunks were computed on (B-31). */
  rejectHunk(path: string, hunkId: string, revision: string): void;

  /** Puts every file back — the one rejection the screen confirms first. */
  rejectAll(promptId: string): void;

  /** Undoes the last rejection of a file, while it is still what the rejection left. */
  restore(path: string): void;
}

/** One rejection that left, and whether it offers an undo when it lands. */
interface Sent {
  readonly path: string | null;
  readonly kind: 'file' | 'hunk' | 'all' | 'restore';
}

/** The words of the toast of each rejection — named in full so the i18n check sees each key. */
const REJECTED: Readonly<Record<'file' | 'hunk', string>> = {
  file: 'notification.changes.rejectedFile',
  hunk: 'notification.changes.rejectedHunk',
};

/**
 * Rejecting what a session changed, by file and by hunk — and undoing it instead of confirming it
 * (plan 08, D-08): a rejection that landed says so in a toast with **Undo**, which puts back exactly
 * what it replaced, while the file has not changed again (S-142). Only "reject all" asks first.
 *
 * The outcome is the session's `session.rewound`, which every connection watching hears; what is
 * mine is told apart by the path I sent, the refusal by the id of my command.
 */
export function useRejections(sessionId: string): Rejections {
  const store = liveSessionStoreOf(sessionId);
  const { error, isAwaiting, expect, inFlight, settle } = useCommandRefusal();
  const sent = useRef<Sent | null>(null);

  const restore = useCallback(
    (path: string) => {
      if (inFlight()) {
        return;
      }

      sent.current = { path, kind: 'restore' };
      expect(restoreChange(wsClient, sessionId, path));
    },
    [expect, inFlight, sessionId],
  );

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        if (state.lastRewind === previous.lastRewind || state.lastRewind === null) {
          return;
        }

        settle();
        const mine = sent.current;
        sent.current = null;
        const { restored, deleted } = state.lastRewind;
        const reverted = mine?.path != null && [...restored, ...deleted].includes(mine.path);

        if (mine?.path != null && reverted && (mine.kind === 'file' || mine.kind === 'hunk')) {
          const path = mine.path;
          let undone = false;

          notify({
            severity: 'info',
            messageKey: REJECTED[mine.kind],
            params: { name: nameOf(path) },
            actions: [
              {
                labelKey: 'sessions.changes.undoReject',
                run: () => {
                  // A toast pressed twice, or pressed after the centre's copy was: one undo.
                  if (!undone) {
                    undone = true;
                    restore(path);
                  }
                },
              },
            ],
          });
        }
      }),
    [restore, settle, store],
  );

  const send = useCallback(
    (what: Sent, commandId: () => string | null) => {
      if (inFlight()) {
        return;
      }

      sent.current = what;
      expect(commandId());
    },
    [expect, inFlight],
  );

  return {
    isRejecting: isAwaiting,
    refusal: error,
    rejectFile: useCallback(
      (file: FileChange) => {
        send({ path: file.path, kind: 'file' }, () =>
          rejectFiles(wsClient, sessionId, file.promptId, [file.path]),
        );
      },
      [send, sessionId],
    ),
    rejectHunk: useCallback(
      (path: string, hunkId: string, revision: string) => {
        send({ path, kind: 'hunk' }, () =>
          rejectHunk(wsClient, sessionId, { path, hunkId, revision }),
        );
      },
      [send, sessionId],
    ),
    rejectAll: useCallback(
      (promptId: string) => {
        send({ path: null, kind: 'all' }, () => rejectFiles(wsClient, sessionId, promptId));
      },
      [send, sessionId],
    ),
    restore,
  };
}
