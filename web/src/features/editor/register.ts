import { FileCode2 } from 'lucide-react';

import { paletteModes } from '@/features/commands';
import { settingsSections } from '@/features/settings';
import { editorAreas, folderTabKeepers, statusBarItems, tabRestorers } from '@/features/workbench';
import type { TabRestorer } from '@/features/workbench';
import { EditorChoiceMode } from './components/EditorChoiceMode';
import { EDITOR_SETTING_OPTIONS, EditorSettings } from './components/EditorSettings';
import { EditorStatus } from './components/EditorStatus';
import { EditorWorkspace } from './components/EditorWorkspace';
import { RecentFilesMode } from './components/RecentFilesMode';
import { CHOICE_MODE } from './hooks/choices';
import { setAutoSaver } from './hooks/documents';
import { autoSave } from './hooks/saving';
import { RECENT_FILES_MODE } from './hooks/useEditorCommands';
import {
  aDocument,
  editorFolders,
  editorStoreOf,
  forgetEditor,
  hasEditorStore,
  isDirty,
} from './store/editor.store';
import { captureEditor, keptEditorFrom, layoutFrom } from './lib/kept-editor';
import type { KeptEditor } from './lib/kept-editor';
import { openPaths } from './lib/layout';

/**
 * What a reload gives each folder tab's editor back (S-216): its groups, tabs and files opened last —
 * paths only. The buffers are never kept: content of a file does not go to the browser's storage
 * (07 · D-14, S-261).
 */
export const EDITOR_RESTORER: TabRestorer<KeptEditor> = {
  id: 'editor.tabs',
  position: 200,
  version: 1,
  parse: keptEditorFrom,
  capture: (folder) => captureEditor(editorStoreOf(folder).getState()),
  apply: (folder, kept) => {
    const layout = layoutFrom(kept);
    editorStoreOf(folder).setState({
      ...layout,
      docs: Object.fromEntries(openPaths(layout).map((path) => [path, aDocument(path)])),
      recent: kept.recent,
    });
  },
  subscribe: (folder, listener) => {
    const store = editorStoreOf(folder);
    let last = JSON.stringify(captureEditor(store.getState()));

    // Told only when what is kept changed: typing changes a buffer, and a buffer is never kept.
    return store.subscribe((state) => {
      const now = JSON.stringify(captureEditor(state));

      if (now !== last) {
        last = now;
        listener();
      }
    });
  },
  forget: forgetEditor,
};

/** The files a folder tab would lose by closing — what the workbench lists before it does (S-262). */
function unsaved(folder: string): readonly string[] {
  return hasEditorStore(folder)
    ? Object.values(editorStoreOf(folder).getState().docs)
        .filter(isDirty)
        .map((doc) => doc.path)
    : [];
}

/**
 * Leaving the page with unsaved changes in any folder tab asks the browser's own question first
 * (07 · D-14, S-261) — reloading included: nothing of a buffer survives it.
 */
export function guardUnload(event: BeforeUnloadEvent): void {
  if (editorFolders().some((folder) => unsaved(folder).length > 0)) {
    event.preventDefault();
    // The older browsers' way of asking: a value, of any kind.
    event.returnValue = '';
  }
}

/**
 * Puts the editor in the places of the workbench it fills — at load, before any folder tab is made
 * (06 · D-31): the editor area, what a reload gives back, what closing a tab would lose, the status
 * bar, Settings › Editor, the palette's choices and recent files, and the guard of the page.
 *
 * @returns the way to take it all back out
 */
export function registerEditor(): () => void {
  setAutoSaver(autoSave);
  window.addEventListener('beforeunload', guardUnload);

  const undo = [
    editorAreas.register({ id: 'editor', position: 100, component: EditorWorkspace }),
    tabRestorers.register(EDITOR_RESTORER as TabRestorer),
    folderTabKeepers.register({ id: 'editor', position: 100, unsaved }),
    statusBarItems.register({ id: 'editor', side: 'right', position: 50, component: EditorStatus }),
    settingsSections.register({
      id: 'editor',
      position: 300,
      labelKey: 'settings.section.editor',
      icon: FileCode2,
      component: EditorSettings,
      options: EDITOR_SETTING_OPTIONS,
    }),
    paletteModes.register({
      id: CHOICE_MODE,
      position: 300,
      placeholderKey: 'editor.choice.placeholder',
      component: EditorChoiceMode,
    }),
    paletteModes.register({
      id: RECENT_FILES_MODE,
      position: 310,
      placeholderKey: 'editor.recent.placeholder',
      component: RecentFilesMode,
    }),
  ];

  return () => {
    window.removeEventListener('beforeunload', guardUnload);

    for (const each of undo) {
      each();
    }
  };
}

/** Takes the editor back out of the workbench — what a test does to see it registered again. */
export const unregisterEditor = registerEditor();
