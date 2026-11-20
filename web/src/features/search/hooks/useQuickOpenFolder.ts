import { useEffect } from 'react';

import { useSearchUi } from '../store/ui.store';

/** A folder's workbench is on screen while the component that calls this is (B-14). */
export function useMountedQuickOpenFolder(folder: string): void {
  useEffect(() => useSearchUi.getState().mount(folder), [folder]);
}

/** The folder Quick Open searches — `null` while none is on screen. */
export function useQuickOpenFolder(): string | null {
  return useSearchUi((state) => state.mounted.at(-1) ?? null);
}
