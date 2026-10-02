/**
 * Public surface of the `editor` feature (plan 07, F5): the code editor of the editor area — its tabs
 * and groups, saving and the conflict, the changes on disk, the diff tab, the preferences.
 *
 * Importing it puts the editor in the places of the workbench it fills (`./register`), at load,
 * before any folder tab is made. The explorer opens files, diffs and "Open editors" through here;
 * the local history (`file-history`) its diffs of a version, and what a restore needs of a file.
 */
import './register';

export { EditorLocation } from './components/EditorLocation';
export type { EditorLocationProps } from './components/EditorLocation';
export { OpenEditors } from './components/OpenEditors';
export { heldFile, reloadFromDisk as reloadFile } from './hooks/documents';
export type { HeldFile } from './hooks/documents';
export {
  activeFile,
  entryMoved,
  openAndRecentFiles,
  openDiff,
  openFile,
  openPreview,
} from './hooks/tabs';
export { activeSelections } from './hooks/views';
export { insertBlocker, insertIntoEditor } from './hooks/insert';
export type { InsertBlocker } from './hooks/insert';
export { colorizeCode, languageOfFence } from './lib/highlight';
export type { CodeToken } from './lib/highlight';
export { useInsertBlocker } from './hooks/useInsertBlocker';
export { canPreview } from './lib/preview-kinds';
export { formatBytes } from './lib/text';
export { useActiveFile, useFileDirty } from './hooks/useEditor';
export { diffSources } from './store/diff-sources';
export type { DiffSide, DiffSource, OpenFileOptions, ProvidedSide } from './types/editor';
