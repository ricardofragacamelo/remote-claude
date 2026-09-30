import { readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';

const LAST_FOLDER_KEY = 'workbench.lastFolder';

/** The folder tab this browser had on screen last — a convenience, never the source of the tabs. */
export function readLastFolder(): string | undefined {
  return readVisitor(LAST_FOLDER_KEY, (value) => (typeof value === 'string' ? value : undefined));
}

export function writeLastFolder(path: string): void {
  writeVisitor(LAST_FOLDER_KEY, path);
}

/**
 * Where "the workbench" is when nothing names a folder: the tab this browser had on screen last, if
 * it is still open; the first tab otherwise; and no tab at all — `null` — when none is open
 * ([06 · D-25](../../../../../docs/plans/06-workbench/decisions.md#d-25--quando--passa-a-levar-à-aba-ativa)).
 */
export function activeOf(open: readonly string[], last: string | undefined): string | null {
  return last !== undefined && open.includes(last) ? last : (open[0] ?? null);
}
