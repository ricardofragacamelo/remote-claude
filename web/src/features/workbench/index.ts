/** Public surface of the `workbench` feature — and where the plans after 06 register what is theirs. */
export { FolderShell } from './components/FolderShell';
export { Workbench } from './components/Workbench';
export { useFolderTab } from './hooks/useFolderTab';
export { useWorkbenchTarget } from './hooks/useWorkbenchTarget';
export { forgetFolderTabs, tabRestorers } from './store/folder-tab.store';
export type { TabRestorer } from './store/tab-state';
export {
  editorAreas,
  folderTabKeepers,
  panelTabs,
  statusBarItems,
  workbenchViews,
} from './store/registries';
export type {
  EditorAreaEntry,
  FolderTab,
  FolderTabKeeper,
  FolderViewProps,
  MobileView,
  PanelTabEntry,
  StatusItemEntry,
  StatusItemProps,
  ViewEntry,
} from './types/workbench';
