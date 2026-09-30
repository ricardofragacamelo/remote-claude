import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { FolderShell, Workbench } from '@/features/workbench';
import { FolderGate } from '@/features/workspace';
import { ClaudeSideBar } from './ClaudeSideBar';
import { useOpenFolder } from './navigation';

/**
 * `/workbench?folder=` — the folder tabs, with the active one's folder in the URL.
 *
 * The folder of the tab on screen is resolved before anything of it shows, the address is replaced
 * by the real path when a link named a symlink, and a session starts on that real path — never on
 * the first root by default, which is the case that started plan 06 (B-16). A `/workbench` naming no
 * folder never gets here: the route sends it to the welcome screen.
 *
 * Every open tab keeps its session attached, the ones not on screen included — the frame holds
 * them (S-181).
 */
export function WorkbenchRoute(): React.JSX.Element {
  const search = useSearch({ from: '/_frame/workbench' });
  const navigate = useNavigate();
  const openFolder = useOpenFolder();

  // Replaced, not pushed: the link that named a symlink is not a place anybody should come back to.
  const moved = useCallback(
    (real: string) => {
      void navigate({ to: '/workbench', search: { folder: real }, replace: true });
    },
    [navigate],
  );

  const home = useCallback(() => {
    void navigate({ to: '/' });
  }, [navigate]);

  const renderFolder = useCallback(
    (path: string) => (
      <FolderGate folder={path} onOpen={openFolder} onMoved={moved} onHome={home}>
        {(folder) => (
          <FolderShell folder={folder.path} claude={<ClaudeSideBar folder={folder.path} />} />
        )}
      </FolderGate>
    ),
    [home, moved, openFolder],
  );

  return (
    <Workbench
      active={search.folder}
      onActivate={openFolder}
      onWelcome={home}
      renderFolder={renderFolder}
    />
  );
}
