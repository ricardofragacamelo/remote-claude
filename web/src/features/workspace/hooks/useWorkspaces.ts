import type { AppError } from '@/shared/api/errors';
import { useLoad } from '@/shared/hooks/useLoad';
import { fetchWorkspaces } from '../services/workspace.service';
import { useWorkspaceStore } from '../store/workspace.store';
import type { Workspace } from '../types/workspace';

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
 * The load itself is `useLoad`, which every screen that reads something shares: the four states
 * are normative, and two screens disagreeing about what "loading" means is what having them in
 * one place prevents. What is left here is the part that is about workspaces — the choice.
 */
export function useWorkspaces(): Workspaces {
  const selected = useWorkspaceStore((state) => state.selected);
  const select = useWorkspaceStore((state) => state.select);

  const { load, isLoading, error, reload } = useLoad(fetchWorkspaces);

  return {
    isLoading,
    error,
    workspaces: load.status === 'ready' ? load.value : [],
    selected,
    select,
    reload,
  };
}
