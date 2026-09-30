import { useOpenFolders } from '@/features/workspace';
import { activeOf, readLastFolder } from './last-folder';

/**
 * The folder the "Workbench" of the navigation leads to — the active tab, when there is one — or
 * `null`, when no tab is open and the way in is the welcome screen (plan 06, S-187).
 *
 * @param signedIn whether there is anybody to read the tabs of — nobody signed in has none
 */
export function useWorkbenchTarget(signedIn: boolean): string | null {
  const { folders } = useOpenFolders({ enabled: signedIn });

  return activeOf(
    folders.map((folder) => folder.path),
    readLastFolder(),
  );
}
