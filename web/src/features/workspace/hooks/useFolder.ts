import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { resolveFolder } from '../services/workspace.service';
import type { ResolvedFolder } from '../types/workspace';
import { stateOf } from './query-state';
import type { QueryState } from './query-state';
import { useOpenFolders } from './useOpenFolders';
import { workspaceKeys } from './workspace-keys';

/** The folder a link names, once the server has said what it is. */
export interface FolderOpening extends QueryState {
  /** The folder as the server resolved it — its `path` is the real one. */
  readonly folder: ResolvedFolder | undefined;

  /** Why the path cannot be opened at all: outside the allowlist, missing, a file. */
  readonly error: AppError | null;

  /**
   * Why the folder could not be kept among the tabs and the recent ones — past the ceiling of tabs,
   * typically. The folder is still open: this is said beside it, not instead of it
   * ([06 · D-23](../../../../../docs/plans/06-workbench/decisions.md#d-23--abrir-pela-url-no-teto-de-abas-antes-de-existir-fechar-aba)).
   */
  readonly recordError: AppError | null;
}

/**
 * The folder of the workbench's URL: resolved first, then recorded.
 *
 * Resolved **before anything else**, and the path that goes on is the one the server answered —
 * every symlink resolved — never the one the link spelled. When they differ, `onMoved` is told the
 * real one, so the address can be replaced by it (plan 06, S-78); the answer is seeded under the real
 * path, and the second resolution costs nothing.
 *
 * Then the folder is recorded as open, which on the server also records it as recent. Once per real
 * path: a reload of the page records it again, and the server answers the tab already there.
 *
 * @param onMoved has to be stable across renders — it sits in an effect's dependencies
 */
export function useFolder(requested: string, onMoved: (real: string) => void): FolderOpening {
  const queryClient = useQueryClient();
  const { open } = useOpenFolders();
  const query = useQuery<ResolvedFolder, AppError>({
    queryKey: workspaceKeys.resolve(requested),
    queryFn: () => resolveFolder(requested),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const resolved = query.data;
  const real = resolved?.path;

  const recorded = useRef<string | null>(null);
  const [refusal, setRefusal] = useState<{ path: string; error: AppError } | null>(null);

  useEffect(() => {
    if (resolved !== undefined && resolved.path !== requested) {
      queryClient.setQueryData(workspaceKeys.resolve(resolved.path), resolved);
      onMoved(resolved.path);
    }
  }, [onMoved, queryClient, requested, resolved]);

  useEffect(() => {
    if (real === undefined || recorded.current === real) {
      return;
    }

    recorded.current = real;
    open(real).catch((error: AppError) => {
      setRefusal({ path: real, error });
    });
  }, [open, real]);

  return {
    folder: resolved,
    ...stateOf(query),
    recordError: refusal !== null && refusal.path === real ? refusal.error : null,
  };
}
