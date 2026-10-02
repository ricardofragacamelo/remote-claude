/**
 * What a person did to a file of an open folder, as the trail recorded it (plan 07, B-16) — the
 * download included, which takes a file or a folder off the machine (B-48).
 */
export type FileAct =
  'created' | 'written' | 'moved' | 'copied' | 'deleted' | 'failed' | 'downloaded' | 'restored';

export const FILE_ACTS: readonly FileAct[] = [
  'created',
  'written',
  'moved',
  'copied',
  'deleted',
  'failed',
  'downloaded',
  'restored',
];

/** One fact about a file — the act, the path, when. Never what the file holds. */
export interface FileFact {
  readonly id: string;
  readonly act: FileAct;

  /** The path relative to the folder it was in. */
  readonly path: string;

  /** Where a move or a copy took it, relative too; `null` for every other act. */
  readonly to: string | null;

  /** ISO 8601. */
  readonly at: string;
}

/** One page of the facts, and the cursor of the next — opaque, and `null` on the last. */
export interface FileFactPage {
  readonly facts: readonly FileFact[];
  readonly nextCursor: string | null;
}
