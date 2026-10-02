import { useEffect, useEffectEvent } from 'react';

import { activeFile, openFile } from './tabs';
import { useActiveFile } from './useEditor';

/**
 * The active file of a folder tab and the address, kept in step (B-40, S-10, S-216):
 *
 * - a `file=` the address names is opened — a link pasted elsewhere opens the folder with that file
 *   active; one that climbs out of the folder (`../x`) is the server's to refuse, and the refusal is
 *   shown where the editor would be (S-11);
 * - the file a person puts on screen goes to the address, replacing it — tabs and groups come back
 *   from what the tab kept, never from the address.
 *
 * @param onFile writes the active file to the address — the route's to perform
 */
export function useEditorLocation(
  folder: string,
  file: string | undefined,
  onFile: (file: string | null) => void,
): void {
  const active = useActiveFile(folder);

  useEffect(() => {
    if (file !== undefined && file !== activeFile(folder)) {
      openFile(folder, file);
    }
  }, [folder, file]);

  // Told the address as it is when the active file changes — a new address alone is answered above.
  const report = useEffectEvent(() => {
    // Read now, not from the render: the address may have just opened another file.
    const current = activeFile(folder);

    if (current !== (file ?? null)) {
      onFile(current);
    }
  });

  useEffect(() => {
    report();
  }, [folder, active]);
}
