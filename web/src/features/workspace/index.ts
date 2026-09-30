/** Public surface of the `workspace` feature. */
export { FolderDialogHost } from './components/FolderDialogHost';
export type { FolderDialogHostProps } from './components/FolderDialogHost';
export { FolderGate } from './components/FolderGate';
export { WelcomeScreen } from './components/WelcomeScreen';
export { WorkspaceSettings } from './components/WorkspaceSettings';
export { useOpenFolders } from './hooks/useOpenFolders';
export type { OpenFolders } from './hooks/useOpenFolders';
export { useFolderDialog } from './store/folder-dialog.store';
export type { OpenFolder, OpenFolderState, ResolvedFolder, Workspace } from './types/workspace';
