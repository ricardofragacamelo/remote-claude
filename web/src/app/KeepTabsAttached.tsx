import { useCallback } from 'react';
import { useRouterState } from '@tanstack/react-router';

import { KeepPermissionsAttached } from '@/features/permission';
import { KeepSessionAttached, Notifiers, usePanelSessions } from '@/features/session';
import { folderTabStore } from '@/features/workbench';
import { useOpenFolders } from '@/features/workspace';
import { useOpenFolder } from './navigation';

/**
 * Keeps the sessions of every open folder tab attached — every conversation of its panel, the tabs
 * not on screen included, and on every screen of the app, not only the workbench's.
 *
 * A tab that is not on screen has no tree, but its sessions go on: the question one asks and what it
 * says arrive into its stores, and coming back to the tab attaches nothing again
 * ([06 · D-11](../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas),
 * S-181; plan 08, S-191). Closing the tab lets go of them — and never ends a session, which lives in
 * the backend. A question asked in a tab not on screen is said everywhere, with the way to it (S-189).
 */
export function KeepTabsAttached(): React.JSX.Element {
  const { folders } = useOpenFolders();
  const openFolder = useOpenFolder();
  const location = useRouterState({ select: (state) => state.location });
  const search = location.search as Readonly<Record<string, unknown>>;
  const activeFolder =
    location.pathname === '/workbench' && typeof search['folder'] === 'string'
      ? search['folder']
      : null;

  const onOpen = useCallback(
    (folder: string, sessionId: string) => {
      openFolder(folder);
      const tab = folderTabStore(folder).getState();
      tab.showSession(sessionId);
      tab.showSecondary();
    },
    [openFolder],
  );

  return (
    <>
      {folders.map((folder) => (
        <KeepTab key={folder.path} folder={folder.path} />
      ))}
      <Notifiers activeFolder={activeFolder} onOpen={onOpen} />
    </>
  );
}

function KeepTab({ folder }: { readonly folder: string }): React.JSX.Element {
  const sessions = usePanelSessions(folder);

  return (
    <>
      {sessions.map((sessionId) => (
        <KeepSession key={sessionId} sessionId={sessionId} />
      ))}
    </>
  );
}

function KeepSession({ sessionId }: { readonly sessionId: string }): React.JSX.Element {
  return (
    <>
      <KeepSessionAttached sessionId={sessionId} />
      <KeepPermissionsAttached sessionId={sessionId} />
    </>
  );
}
