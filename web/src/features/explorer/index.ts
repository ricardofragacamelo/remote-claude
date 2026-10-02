/**
 * Public surface of the `explorer` feature (plan 07, F4) — the tree of the open folder and every
 * function on its files. The app registers it in the workbench at load; nothing else reaches in.
 */
export { registerExplorer } from './components/registration';
export { ExplorerView } from './components/ExplorerView';
export { explorerStore } from './store/explorer.store';
