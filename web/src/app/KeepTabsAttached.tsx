import { KeepPermissionsAttached } from '@/features/permission';
import { KeepSessionAttached } from '@/features/session';
import { useFolderTab } from '@/features/workbench';
import { useOpenFolders } from '@/features/workspace';

/**
 * Keeps the session of every open folder tab attached — the ones not on screen included, and on
 * every screen of the app, not only the workbench's.
 *
 * A tab that is not on screen has no tree, but its session goes on: the question it asks and what
 * it says arrive into its stores, and coming back to the tab attaches nothing again
 * ([06 · D-11](../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas),
 * S-181). Closing the tab lets go of it — and never ends the session, which lives in the backend.
 */
export function KeepTabsAttached(): React.JSX.Element {
  const { folders } = useOpenFolders();

  return (
    <>
      {folders.map((folder) => (
        <KeepTab key={folder.path} folder={folder.path} />
      ))}
    </>
  );
}

function KeepTab({ folder }: { readonly folder: string }): React.JSX.Element | null {
  const { sessionId } = useFolderTab(folder);

  return sessionId === null ? null : (
    <>
      <KeepSessionAttached sessionId={sessionId} />
      <KeepPermissionsAttached sessionId={sessionId} />
    </>
  );
}
