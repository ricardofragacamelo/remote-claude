import { useEffect, useRef } from 'react';

import type { OpenFolder } from '@/features/workspace';
import { notify } from '@/shared/lib/notify';

/**
 * Tells the person when a folder with an open tab stops being allowed — the allowlist changed on
 * the machine while the tab was open. Something they did not ask about and need to know
 * (06 · D-17): the tab stays, marked, and nothing opens in it.
 *
 * Only a change seen **here** is told: a tab that was already not allowed when the tabs were first
 * read is marked, and was told about — if at all — by the window that saw it change.
 */
export function useAllowlistNotices(folders: readonly OpenFolder[]): void {
  const seen = useRef<ReadonlyMap<string, OpenFolder['state']> | null>(null);

  useEffect(() => {
    const before = seen.current;
    seen.current = new Map(folders.map((folder) => [folder.path, folder.state]));

    if (before === null) {
      return;
    }

    for (const folder of folders) {
      if (folder.state === 'notAllowed' && before.get(folder.path) === 'available') {
        notify({
          severity: 'warning',
          messageKey: 'notification.folder.notAllowed',
          params: { folder: folder.path },
        });
      }
    }
  }, [folders]);
}
