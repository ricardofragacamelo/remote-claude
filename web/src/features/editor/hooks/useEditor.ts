import { useEffect } from 'react';
import { useStore } from 'zustand';

import { activeGroupOf, activeTabOf } from '../lib/layout';
import { followDisk } from '../services/disk-changes.service';
import { editorStoreOf, isDirty } from '../store/editor.store';
import type { EditorState } from '../store/editor.store';
import { useEditorPreferences } from '../store/preferences.store';
import type { EditorPreferences, EditorTab, FileDocument } from '../types/editor';
import { diskChanged, revalidateAll } from './documents';
import { activeFileOf } from './tabs';

/** The editor of a folder tab, as React state — or the part `select` picks of it. */
export function useEditorState<T>(folder: string, select: (state: EditorState) => T): T {
  return useStore(editorStoreOf(folder), select);
}

/** One open file of a folder tab, as React state. */
export function useDocument(folder: string, path: string): FileDocument | undefined {
  return useEditorState(folder, (state) => state.docs[path]);
}

/** The file of the active editor tab of `folder` — `null` for none — as React state. */
export function useActiveFile(folder: string): string | null {
  return useEditorState(folder, activeFileOf);
}

/**
 * Whether the buffer of a file has changes the disk does not — what a chip of Claude's context warns
 * of: Claude reads what is saved, not what is on screen (plan 08, S-250).
 */
export function useFileDirty(folder: string, path: string): boolean {
  return useEditorState(folder, (state) => {
    const doc = state.docs[path];
    return doc !== undefined && isDirty(doc);
  });
}

/** The open file the active tab of the group with the focus shows, as React state. */
export function useActiveDocument(folder: string): FileDocument | undefined {
  return useEditorState(folder, (state) => {
    const tab = activeTabOf(activeGroupOf(state));
    return tab?.kind === 'file' ? state.docs[tab.path] : undefined;
  });
}

/** The editor's preferences, for every tab, and the way to change one (B-39). */
export function usePreferences(): {
  readonly preferences: EditorPreferences;
  set<K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]): void;
} {
  const preferences = useEditorPreferences((state) => state.preferences);
  const set = useEditorPreferences((state) => state.set);
  return { preferences, set };
}

/**
 * Follows the folder's disk while its editor is on screen — the tab that is not on screen spends no
 * watch (06 · D-11) — and, coming back on screen, asks the disk about every open file with the version
 * it shows: a clean one that changed meanwhile is reloaded, a dirty one warned about (S-259, S-263).
 */
export function useDiskChanges(folder: string): void {
  useEffect(() => {
    void revalidateAll(folder);

    return followDisk(folder, {
      changed: (changes, overflow) => {
        void diskChanged(folder, changes, overflow);
      },
      resumed: () => {
        void revalidateAll(folder);
      },
    });
  }, [folder]);
}

/** What a tab shows of its file: unsaved changes, deleted on disk, in the light mode. */
export function useTabState(
  folder: string,
  tab: EditorTab,
): { readonly dirty: boolean; readonly deleted: boolean; readonly light: boolean } {
  const doc = useEditorState(folder, (state) =>
    tab.kind === 'diff' ? undefined : state.docs[tab.path],
  );

  return { dirty: isDirty(doc), deleted: doc?.deleted === true, light: doc?.light === true };
}
