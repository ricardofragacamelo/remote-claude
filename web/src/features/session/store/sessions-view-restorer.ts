import type { TabRestorer } from '@/features/workbench';
import { isRecord } from '@/shared/lib/json';
import { SESSION_GROUPS } from '../types/sessions-view';
import type { OriginFilter, SessionGroup, SessionSort } from '../types/sessions-view';
import { forgetSessionsView, sessionsViewStore } from './sessions-view.store';

/** What a reload gives the view of a tab back: how it was narrowed and folded — never a row. */
export interface KeptSessionsView {
  readonly origin: OriginFilter;
  readonly sort: SessionSort;
  readonly includeSubfolders: boolean;
  readonly collapsed: readonly SessionGroup[];
}

const ORIGINS: readonly string[] = ['all', 'ours', 'external'];
const SORTS: readonly string[] = ['recent', 'name'];

/** A kept view, as far as it can be trusted: anything unreadable is its default. */
export function keptSessionsViewFrom(saved: unknown): KeptSessionsView | undefined {
  if (!isRecord(saved)) {
    return undefined;
  }

  const collapsed = Array.isArray(saved['collapsed']) ? saved['collapsed'] : [];

  return {
    origin: ORIGINS.includes(saved['origin'] as string) ? (saved['origin'] as OriginFilter) : 'all',
    sort: SORTS.includes(saved['sort'] as string) ? (saved['sort'] as SessionSort) : 'recent',
    includeSubfolders: saved['includeSubfolders'] === true,
    collapsed: SESSION_GROUPS.filter((group) => collapsed.includes(group)),
  };
}

/**
 * The view's part of what a folder tab keeps across a reload (06 · D-31) — and the way its state
 * goes when the tab closes. The search is not kept: a reload is a fresh look.
 */
export const SESSIONS_VIEW_RESTORER: TabRestorer<KeptSessionsView> = {
  id: 'session.sessionsView',
  position: 300,
  version: 1,
  parse: keptSessionsViewFrom,
  capture: (path) => {
    const { origin, sort, includeSubfolders, collapsed } = sessionsViewStore(path).getState();
    return { origin, sort, includeSubfolders, collapsed: [...collapsed] };
  },
  apply: (path, kept) => {
    sessionsViewStore(path).setState({
      origin: kept.origin,
      sort: kept.sort,
      includeSubfolders: kept.includeSubfolders,
      collapsed: new Set(kept.collapsed),
    });
  },
  subscribe: (path, listener) => sessionsViewStore(path).subscribe(listener),
  forget: forgetSessionsView,
};
