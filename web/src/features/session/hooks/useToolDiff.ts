import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchToolDiff } from '../services/changes.service';
import type { ToolDiff } from '../types/changes';
import { changeKeys } from './change-keys';
import { loadedOf } from './loaded';
import type { Loaded } from './loaded';

/**
 * The diff of an `Edit`, `MultiEdit` or `Write` of a live session (plan 08, B-27) — read when the
 * card asks for it, and again once a turn or an undo changed the disk (the hook of the changes
 * invalidates every key under the session).
 */
export function useToolDiff(sessionId: string, toolUseId: string): Loaded<ToolDiff> {
  return loadedOf(
    useQuery<ToolDiff, AppError>({
      queryKey: changeKeys.tool(sessionId, toolUseId),
      queryFn: () => fetchToolDiff(sessionId, toolUseId),
      staleTime: 0,
      retry: false,
    }),
  );
}
