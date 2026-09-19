import { useCallback, useEffect, useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { fetchWorkspaces } from '../services/workspace.service';
import { useWorkspaceStore } from '../store/workspace.store';
import type { Workspace } from '../types/workspace';

/**
 * Where the load is.
 *
 * One value rather than three booleans kept in step with each other: "loading and also holding an
 * error" is a state this cannot express, and it is the state a screen eventually renders when the
 * flags are separate.
 */
type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly workspaces: readonly Workspace[] }
  | { readonly status: 'failed'; readonly error: AppError };

/** What the selector gets: the four states, the choice, and the two things it can do. */
export interface Workspaces {
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly workspaces: readonly Workspace[];
  readonly selected: string | null;
  select(path: string): void;
  reload(): void;
}

/**
 * The roots, as the screen sees them.
 *
 * The hook is the only layer that knows both sides: React above, the service below. The component
 * never learns that HTTP exists, and the service never learns that React does — see
 * docs/architecture/web/01-architecture.md.
 *
 * The first render is already `loading`, because that is the truth: the request is about to go
 * out. Setting it from inside the effect would be a second render that says the same thing.
 */
export function useWorkspaces(): Workspaces {
  const selected = useWorkspaceStore((state) => state.selected);
  const select = useWorkspaceStore((state) => state.select);

  const [load, setLoad] = useState<Load>({ status: 'loading' });

  // Bumped by `reload`, which is what re-runs the effect. Calling the service straight from the
  // button would race the load already in flight, and the slower answer would win.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void fetchWorkspaces()
      .then((workspaces) => {
        if (!cancelled) {
          setLoad({ status: 'ready', workspaces });
        }
      })
      .catch((error: AppError) => {
        if (!cancelled) {
          // The list goes with the error: leaving the previous roots on screen next to it says
          // they are still there, and the next click would act on a list that is no longer true.
          setLoad({ status: 'failed', error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  return {
    isLoading: load.status === 'loading',
    error: load.status === 'failed' ? load.error : null,
    workspaces: load.status === 'ready' ? load.workspaces : [],
    selected,
    select,
    reload,
  };
}
