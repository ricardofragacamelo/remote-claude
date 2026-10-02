import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchChanges } from '../services/changes.service';
import { claudePanelStore } from '../store/claude-panel.store';
import type { ChangesFilter, FileChange } from '../types/changes';
import { changeKeys } from './change-keys';
import { useDiskMoves } from './useDiskMoves';
import { useReviewMarks } from './useClaudePanel';
import { useLiveSessionAttachment } from './useLiveSessionAttachment';
import { useSessionEnded } from './useSessionEnded';

/** A file of the changes, with whether this tab marked it reviewed. */
export interface ReviewedChange extends FileChange {
  readonly reviewed: boolean;
}

/** What the view of the changes gets. */
export interface SessionChangesState {
  /** The files the filter lets through, in path order. */
  readonly files: readonly ReviewedChange[];

  /** Every file, whatever the filter — what the counts are of. */
  readonly all: readonly ReviewedChange[];
  readonly pending: number;

  /** The turn before everything the session changed — what "reject all" goes back to. */
  readonly firstPromptId: string | null;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly filter: ChangesFilter;
  setFilter(filter: ChangesFilter): void;

  /** Marks a file reviewed — writes nothing anywhere but this tab (D-18). */
  accept(file: FileChange): void;
  unaccept(file: FileChange): void;
  acceptAll(): void;
  reload(): void;
}

function matches(file: ReviewedChange, filter: ChangesFilter): boolean {
  return filter === 'all' || (filter === 'reviewed') === file.reviewed;
}

/**
 * What a live session changed, file by file, against before the session (plan 08, B-28).
 *
 * Server data, and **live** data: read again whenever a turn completes and whenever an undo or a
 * rejection lands — the two moments the answer is known to have moved, as the undo's preview does
 * (S-123). "Accepted" is the tab's own mark of the version looked at; it survives switching tabs and
 * a reload, and a later change of the file makes it pending again (S-125).
 */
export function useSessionChanges(folder: string, sessionId: string): SessionChangesState {
  const queryClient = useQueryClient();
  const panel = claudePanelStore(folder);
  const { marks, filter } = useReviewMarks(folder, sessionId);
  const ended = useSessionEnded(sessionId);

  // What moves the list is the stream — a turn ending, an undo landing — so the view holds it while
  // it is up, shared with whatever else holds the same session.
  useLiveSessionAttachment(sessionId);

  const query = useQuery<Awaited<ReturnType<typeof fetchChanges>>, AppError>({
    queryKey: changeKeys.of(sessionId),
    queryFn: () => fetchChanges(sessionId),
    enabled: !ended,
    staleTime: 0,
    retry: false,
  });

  useDiskMoves(sessionId, () => {
    void queryClient.invalidateQueries({ queryKey: changeKeys.of(sessionId) });
  });

  const all = useMemo<ReviewedChange[]>(
    () =>
      (query.data?.files ?? []).map((file) => ({
        ...file,
        reviewed: marks?.[file.path] === file.revision,
      })),
    [marks, query.data],
  );

  const accept = useCallback(
    (file: FileChange) => {
      panel.getState().review(sessionId, [file]);
    },
    [panel, sessionId],
  );

  return {
    files: all.filter((file) => matches(file, filter)),
    all,
    pending: all.filter((file) => !file.reviewed).length,
    firstPromptId: query.data?.promptId ?? null,
    isLoading: query.isLoading,
    error: query.error,
    filter,
    setFilter: useCallback(
      (next: ChangesFilter) => {
        panel.getState().setChangesFilter(next);
      },
      [panel],
    ),
    accept,
    unaccept: useCallback(
      (file: FileChange) => {
        panel.getState().unreview(sessionId, file.path);
      },
      [panel, sessionId],
    ),
    acceptAll: () => {
      panel.getState().review(sessionId, all);
    },
    reload: () => {
      void query.refetch();
    },
  };
}
