import { MessagesSquare } from 'lucide-react';

import { tabRestorers, workbenchViews } from '@/features/workbench';
import { SESSIONS_VIEW_RESTORER } from '../../store/sessions-view-restorer';
import { SessionsView } from './SessionsView';

/** The id of the view in the activity bar — the place plan 06 held for it. */
export const SESSIONS_VIEW = 'sessions';

/**
 * Puts the view of Claude's sessions in the workbench — once, at load, before any folder tab is made:
 * it takes over the place of the activity bar plan 06 held for it, and what a reload gives back of
 * it joins the restoration of the tab.
 *
 * @returns the way to take it back out — the place goes back to its placeholder
 */
export function registerSessionsView(): () => void {
  const undo = [
    workbenchViews.register({
      id: SESSIONS_VIEW,
      position: 300,
      labelKey: 'workbench.sessions.label',
      icon: MessagesSquare,
      component: SessionsView,
      placeholderKey: 'workbench.sessions.placeholder',
    }),
    tabRestorers.register(SESSIONS_VIEW_RESTORER as Parameters<typeof tabRestorers.register>[0]),
  ];

  return () => {
    for (const each of undo) {
      each();
    }
  };
}
