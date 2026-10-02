import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { EditorLocation } from '@/features/editor';
import { PanelCommands } from '@/features/session';
import { FolderShell, Workbench } from '@/features/workbench';
import { FolderGate } from '@/features/workspace';
import { ClaudeSideBar } from './ClaudeSideBar';
import { PanelLocation } from './PanelLocation';
import { useOpenFolder } from './navigation';

/**
 * `/workbench?folder=&file=&session=|conversation=` — the folder tabs, with the active one's folder in
 * the URL, the file its editor has active (plan 07, B-40), and what its panel of Claude shows (plan
 * 08, B-12).
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

  // Replaced, not pushed: putting a file on screen is not a step anybody goes back through. What the
  // panel shows stays in the address beside it.
  const fileShown = useCallback(
    (folder: string, file: string | null) => {
      void navigate({
        to: '/workbench',
        search: (previous) => ({ ...previous, folder, file: file ?? undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  // The same for the panel of Claude: a session or a conversation, never both (plan 08, D-24).
  const panelShown = useCallback(
    (
      folder: string,
      panel: { readonly session: string | null; readonly conversation: string | null },
    ) => {
      void navigate({
        to: '/workbench',
        search: (previous) => ({
          ...previous,
          folder,
          session: panel.session ?? undefined,
          conversation: panel.conversation ?? undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const renderFolder = useCallback(
    (path: string) => (
      <FolderGate folder={path} onOpen={openFolder} onMoved={moved} onHome={home}>
        {(folder) => (
          <>
            <EditorLocation
              folder={folder.path}
              file={search.file}
              onFile={(file) => {
                fileShown(folder.path, file);
              }}
            />
            <PanelLocation
              folder={folder.path}
              session={search.session}
              conversation={search.conversation}
              onPanel={(panel) => {
                panelShown(folder.path, panel);
              }}
            />
            <PanelCommands folder={folder.path} />
            <FolderShell folder={folder.path} claude={<ClaudeSideBar folder={folder.path} />} />
          </>
        )}
      </FolderGate>
    ),
    [
      fileShown,
      home,
      moved,
      openFolder,
      panelShown,
      search.conversation,
      search.file,
      search.session,
    ],
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
