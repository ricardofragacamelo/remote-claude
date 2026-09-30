import { useRegistry } from '@/shared/hooks/useRegistry';
import { HELD_VIEWS, workbenchViews } from '../store/registries';
import type { ViewEntry } from '../types/workbench';

/**
 * The view to show for an id: the one registered under it — or, when the id names none any more (a
 * state an older version left, a view taken out), the first of the activity bar, and the Explorer's
 * place when even the bar is empty.
 */
export function viewOf(views: readonly ViewEntry[], id: string): ViewEntry {
  return views.find((view) => view.id === id) ?? views[0] ?? HELD_VIEWS[0];
}

/** The view of the side bar, as registered now. */
export function useActiveView(id: string): ViewEntry {
  return viewOf(useRegistry(workbenchViews), id);
}
