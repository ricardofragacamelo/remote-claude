/**
 * Public surface of the `file-history` feature (plan 07, F8): the local history of a folder — the
 * Timeline of the active file, the files deleted recently, restoring a version, and the "Undo" of a
 * delete the history kept. Only local history: there is no git here.
 *
 * The explorer shows the Timeline and undoes its deletes through here; this feature never reaches
 * the explorer — it reaches the editor, through the editor's barrel, for its diffs and buffers.
 */
export { Timeline } from './components/Timeline';
export type { TimelineProps } from './components/Timeline';
export { undoDeletion } from './hooks/undo-deletion';
export { useFileHistoryCommands } from './hooks/useFileHistoryCommands';
export { forgetTimeline } from './store/timeline.store';
export type { KeptEntry, RestoreResult } from './types/history';
