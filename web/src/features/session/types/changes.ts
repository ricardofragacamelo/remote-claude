import type { Hunk } from '@/shared/lib/diff-hunk';

/** What is known of one side of a file the agent changed. */
export type ChangeSideState = 'content' | 'absent' | 'unavailable' | 'notRestorable';

/** One side of a diff, as the backend reads it — the text when it is known. */
export interface ChangeSide {
  readonly state: ChangeSideState;
  readonly content: string | null;

  /** Why the side is not known — `laterTouch`, `noSnapshot`, `tooLarge`… */
  readonly reason: string | null;
}

/** The side after a call — or after it would run —, with the replacement that would not apply. */
export interface ToolDiffAfter extends ChangeSide {
  /** Which replacement would not apply, from 0 — on `editMissing` and `editAmbiguous`. */
  readonly edit: number | null;
}

/** The diff of one call that edits or writes a file (plan 08, B-25; plan 28, B-17). */
export interface ToolDiff {
  /** Absolute, as the tool wrote it. */
  readonly path: string;

  /** The kind of the call — `file.edit` or `file.write`. */
  readonly kind: string;

  /** The call still waits for an answer: before is the disk now, after the disk with the change. */
  readonly pending: boolean;

  /** `file` — hunks of the whole file; `edit` — of the strings the tool replaced. */
  readonly scope: 'file' | 'edit';
  readonly before: ChangeSide;
  readonly after: ToolDiffAfter;
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
