import { openDiff } from '@/features/editor';
import type { DiffSide } from '@/features/editor';
import { timelineStore } from '../store/timeline.store';
import type { HistoryEntry } from '../types/history';

/** A version as one side of a diff tab of the editor. */
function sideOf(entry: HistoryEntry): DiffSide {
  return { path: entry.path, source: 'history', version: { entryId: entry.id, at: entry.at } };
}

/**
 * A version beside the file as the person has it now — the buffer of its editor, or the disk when it
 * is not open — in a read-only diff tab (S-346).
 */
export function compareWithCurrent(folder: string, entry: HistoryEntry): void {
  openDiff(folder, sideOf(entry), { path: entry.path, source: 'buffer' });
}

/** Two versions side by side, the older at the left — and the one picked first let go. */
export function compareVersions(folder: string, one: HistoryEntry, other: HistoryEntry): void {
  const [older, newer] = Date.parse(one.at) <= Date.parse(other.at) ? [one, other] : [other, one];

  openDiff(folder, sideOf(older), sideOf(newer));
  timelineStore(folder).getState().select(null);
}
