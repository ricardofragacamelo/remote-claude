import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { fetchWorkspaces } from '../services/workspace.service';
import type { Workspace } from '../types/workspace';
import { stateOf } from './query-state';
import type { QueryState } from './query-state';
import { workspaceKeys } from './workspace-keys';

/** The roots, and the four states of reading them. */
export interface Roots extends QueryState {
  readonly roots: readonly Workspace[];
}

/**
 * The roots this user may open — what the welcome screen lists and the dialog starts from.
 *
 * Server data, so it lives in the query cache: the welcome screen and the dialog read the same
 * answer, and a second screen asking within thirty seconds asks nothing.
 */
export function useRoots(): Roots {
  const query = useQuery<readonly Workspace[], AppError>({
    queryKey: workspaceKeys.roots(),
    queryFn: fetchWorkspaces,
  });

  return {
    roots: query.data ?? [],
    ...stateOf(query),
  };
}
