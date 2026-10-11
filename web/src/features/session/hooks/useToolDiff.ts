import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchToolDiff } from '../services/changes.service';
import type { ToolDiff } from '../types/changes';
import { changeKeys } from './change-keys';
import { loadedOf } from './loaded';
import type { Loaded } from './loaded';

/** A read of the diff, and when it was read — what a preview against the disk says it is of. */
export type LoadedToolDiff = Loaded<ToolDiff> & { readonly readAt: number };

/**
 * The diff of a call that edits or writes a file, of a live session (plan 08, B-27) — read when the
 * card asks for it, and again once a turn or an undo changed the disk (the hook of the changes
 * invalidates every key under the session).
 *
 * A call still waiting for an answer is previewed against the disk **now** (plan 28, B-17): under a
 * key of its own, so the row of the call that ran never shows the preview, and read again whenever
 * the window gets the focus back — the disk can change before the answer (plan 08, S-131).
 */
export function useToolDiff(sessionId: string, toolUseId: string, pending = false): LoadedToolDiff {
  const key = changeKeys.tool(sessionId, toolUseId);
  const query = useQuery<ToolDiff, AppError>({
    queryKey: pending ? [...key, 'pending'] : key,
    queryFn: () => fetchToolDiff(sessionId, toolUseId),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: pending,
  });

  return { ...loadedOf(query), readAt: query.dataUpdatedAt };
}
