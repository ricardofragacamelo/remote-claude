import { RecentFolderList } from './RecentFolderList';
import { RootList } from './RootList';

/**
 * The Workspaces section of the app's Settings: the roots this installation allows — **read only**,
 * with the command that adds one and where it runs, since changing them takes the disk of the
 * machine — and the recent folders, to pin and to remove (plan 06, S-144).
 *
 * Nothing here opens a folder: this is where they are managed; the welcome screen and "Open folder…"
 * are where they are opened.
 */
export function WorkspaceSettings(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div id="setting-roots" tabIndex={-1}>
        <RootList />
      </div>
      <div id="setting-recent" tabIndex={-1}>
        <RecentFolderList />
      </div>
    </div>
  );
}
