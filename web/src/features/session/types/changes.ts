import type { Hunk } from '@/shared/lib/diff-hunk';

/** What is known of one side of a file Claude changed. */
export type ChangeSideState = 'content' | 'absent' | 'unavailable' | 'notRestorable';

/** One side of a diff, as the backend reads it — the text when it is known. */
export interface ChangeSide {
  readonly state: ChangeSideState;
  readonly content: string | null;

  /** Why the side is not known — `laterTouch`, `noSnapshot`, `tooLarge`… */
  readonly reason: string | null;
}

/** The diff of one `Edit`, `MultiEdit` or `Write` (plan 08, B-25). */
export interface ToolDiff {
  /** Absolute, as the tool wrote it. */
  readonly path: string;
  readonly toolName: string;

  /** `file` — hunks of the whole file; `edit` — of the strings the tool replaced. */
  readonly scope: 'file' | 'edit';
  readonly before: ChangeSide;
  readonly after: ChangeSide;
  readonly hunks: readonly Hunk[];
}

/** What a session did to a file. */
export type ChangeKind = 'created' | 'modified' | 'deleted';

/** One file of what a session changed (B-26). */
export interface FileChange {
  /** Absolute — what the rejections name it by. */
  readonly path: string;
  readonly kind: ChangeKind;

  /** The turn that first touched it — what rejecting the whole file goes back to. */
  readonly promptId: string;

  /** Somebody changed it after the session — rejecting it preserves it. */
  readonly modifiedOutside: boolean;

  /** Lines added and removed — `null` when a side is not text. */
  readonly added: number | null;
  readonly removed: number | null;

  /** The hash of the disk when listed: what a review mark is of. */
  readonly revision: string;
}

/** Everything a session changed, and the turn before all of it. */
export interface SessionChanges {
  readonly promptId: string | null;
  readonly files: readonly FileChange[];
}

/** One file of the changes, whole: what a hunk is rejected against. */
export interface ChangeFile {
  readonly path: string;
  readonly kind: ChangeKind | null;
  readonly promptId: string;
  readonly modifiedOutside: boolean;
  readonly before: ChangeSide;
  readonly now: ChangeSide;
  readonly revision: string;
  readonly hunks: readonly Hunk[];
}

/** Which files of the changes the view lists. */
export type ChangesFilter = 'pending' | 'reviewed' | 'all';
