import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { heldFile, reloadFile } from '@/features/editor';
import type { AppError } from '@/shared/api/errors';
import { sensitiveSubject } from '@/shared/lib/sensitive-files';
import { logger } from '@/shared/logging/logger';
import { asHistoryError } from '../lib/entries';
import { fetchCurrentVersion, restoreVersion } from '../services/history.service';
import { timelineStore } from '../store/timeline.store';
import type { HistoryEntry } from '../types/history';
import { historyKeys } from './history-keys';

/** A restore that did not go, and the path it was for. */
export interface RestoreFailure {
  readonly path: string;
  readonly error: AppError;
}

/** How restoring a version goes, for the Timeline to show. */
export interface Restorer {
  readonly pending: boolean;
  readonly failure: RestoreFailure | null;

  /** The last restore that went — what the live region says. */
  readonly restored: HistoryEntry | null;

  /**
   * Restores a version — at once, or after asking when the buffer has unsaved changes a restore
   * would discard, or the file changes what Claude may do (S-346).
   *
   * @param gone the file no longer exists: it is recreated, never written over something
   */
  request(entry: HistoryEntry, gone: boolean): void;

  /** The question answered "restore". */
  confirm(): void;
  cancel(): void;
  dismiss(): void;
}

/**
 * The version on disk a restore replaces: the one the editor shows, read when the file is not open,
 * none when it no longer exists — a restore then recreates it, and is refused if the path was taken.
 */
async function currentOf(folder: string, path: string, gone: boolean): Promise<string | null> {
  if (gone) {
    return null;
  }

  const held = heldFile(folder, path);

  if (held === null) {
    return fetchCurrentVersion(folder, path);
  }

  return held.deleted ? null : held.etag;
}

/**
 * Restoring a version of the Timeline: a write like any other — `If-Match` with the version the
 * person sees, so a file Claude changed since is never written over (`412`, said plainly); the
 * buffer read again from the disk once it went; one restore at a time.
 */
export function useRestore(folder: string): Restorer {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<RestoreFailure | null>(null);
  const [restored, setRestored] = useState<HistoryEntry | null>(null);
  const sending = useRef(false);
  const gone = useRef(false);

  const run = useCallback(
    async (entry: HistoryEntry, confirmSensitive: boolean) => {
      if (sending.current) {
        return;
      }

      sending.current = true;
      setPending(true);
      setFailure(null);

      try {
        const ifMatch = await currentOf(folder, entry.path, gone.current);
        await restoreVersion(folder, entry.id, { ifMatch, confirmSensitive });
        await reloadFile(folder, entry.path);
        void client.invalidateQueries({ queryKey: historyKeys.all(folder) });
        setRestored(entry);
      } catch (error) {
        const refusal = asHistoryError(error);
        logger.warn(
          { op: 'fileHistory.restore', folder, path: entry.path, code: refusal.code },
          'version not restored',
        );
        setFailure({ path: entry.path, error: refusal });
      } finally {
        sending.current = false;
        setPending(false);
      }
    },
    [client, folder],
  );

  const request = useCallback(
    (entry: HistoryEntry, isGone: boolean) => {
      const dirty = !isGone && heldFile(folder, entry.path)?.dirty === true;
      const sensitive = sensitiveSubject(entry.path) !== null;
      gone.current = isGone;

      if (dirty || sensitive) {
        timelineStore(folder).getState().ask({ entry, dirty, sensitive });
      } else {
        void run(entry, false);
      }
    },
    [folder, run],
  );

  return useMemo(
    () => ({
      pending,
      failure,
      restored,
      request,
      confirm: () => {
        const store = timelineStore(folder).getState();
        const question = store.question;
        store.ask(null);

        if (question !== null) {
          void run(question.entry, question.sensitive);
        }
      },
      cancel: () => {
        timelineStore(folder).getState().ask(null);
      },
      dismiss: () => {
        setFailure(null);
      },
    }),
    [failure, folder, pending, request, restored, run],
  );
}
