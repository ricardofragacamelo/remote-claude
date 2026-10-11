import { diffSources } from '@/features/editor';
import { folderTabBadges, statusBarItems, tabRestorers } from '@/features/workbench';
import { SESSION_DIFF_READER } from './services/session-diff-source';
import { AGENT_PANEL_RESTORER } from './store/agent-panel-restorer';
import { ChangesStatusItem } from './components/changes/ChangesStatusItem';
import { AgentStatusItem } from './components/panel/AgentStatusItem';
import { PermissionCount } from './components/panel/PermissionBadges';

/**
 * Puts what a session changed in the workbench (plan 08, F3) — once, at load, before any folder tab
 * is made: the sides of its diffs in the editor, the marks of review in what a tab keeps, and the
 * count of changes in the status bar.
 *
 * @returns the way to take it back out
 */
export function registerAgentChanges(): () => void {
  const undo = [
    diffSources.register(SESSION_DIFF_READER),
    tabRestorers.register(AGENT_PANEL_RESTORER as Parameters<typeof tabRestorers.register>[0]),
    statusBarItems.register({
      id: 'session.changes',
      side: 'left',
      position: 300,
      component: ChangesStatusItem,
    }),
    statusBarItems.register({
      id: 'session.agent',
      side: 'left',
      position: 200,
      component: AgentStatusItem,
    }),
    folderTabBadges.register({
      id: 'session.permissions',
      position: 100,
      component: PermissionCount,
    }),
  ];

  return () => {
    for (const each of undo) {
      each();
    }
  };
}
