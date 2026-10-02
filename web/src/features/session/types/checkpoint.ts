/**
 * Why a file an undo would reach is left as it is.
 *
 * - `modifiedOutside` — somebody changed it after the session did;
 * - `notRestorable` — too large or unreadable to have been saved;
 * - `unsafePath` — it became a link or something other than a regular file, or its directory no
 *   longer resolves;
 * - `noBaseline` — nothing records how the session left it, so the undo will not guess.
 */
export type PreserveReason = 'modifiedOutside' | 'notRestorable' | 'unsafePath' | 'noBaseline';

/** A file that stays, and why. */
export interface PreservedFile {
  readonly path: string;
  readonly reason: PreserveReason;
}

/**
 * What undoing to one point would do **now**, file by file.
 *
 * Grouped the way the confirmation says it, because a confirmation without the list is a
 * confirmation without information: which files go back, which are deleted because the turn
 * created them, which stay and why, and which are already the way they were.
 */
export interface RewindScope {
  readonly restore: readonly string[];
  readonly remove: readonly string[];
  readonly preserve: readonly PreservedFile[];
  readonly unchanged: readonly string[];
}

/** A point the files of a session can go back to: the moment before one of its turns began. */
export interface Checkpoint extends RewindScope {
  /** The turn, as the hooks name it. What an undo is aimed at. */
  readonly promptId: string;

  /** The prompt of that turn, or `null` when there was none to keep. */
  readonly label: string | null;

  /** When the turn began, as ISO-8601 in UTC. */
  readonly at: string;
}

/** What an undo did to the disk — never a boolean. */
export interface RewindOutcome {
  readonly promptId: string;
  readonly restored: readonly string[];

  /** Files the turn had created: before it, they were not there. */
  readonly deleted: readonly string[];

  readonly preserved: readonly PreservedFile[];

  /** Already the way they were. A second undo to the same point lands here. */
  readonly unchanged: readonly string[];

  /** Put back it could not. Each is left exactly as it was — nothing is half-written. */
  readonly failed: readonly string[];

  /** The one hunk that went back — a rejection of a hunk (plan 08, B-31); `null` otherwise. */
  readonly hunkId: string | null;
}

/** Whether the undo can be asked for, and when it cannot, why. */
export type UndoAvailability = 'ready' | 'busy' | 'ended';
