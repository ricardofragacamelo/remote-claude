import type { SessionFileState } from '../entities/session-file-state.entity';
import type { TurnFileCheckpoint } from '../entities/turn-file-checkpoint.entity';
import { hunksBetween, snippetHunk } from './line-diff';
import type { DiffHunk } from './line-diff';
import { isAsLeft } from './file-state';
import type { FileObservation } from './file-state';
import type { CanonicalTool, FileChange as EngineFileChange, ToolKind } from '@domain/engine';

/**
 * What the diffs of a session are made of — plan 08, F3.
 *
 * The diff is ours, out of what the undo already keeps (plan 08, D-03):
 * the change the tool makes, the snapshot of the turn and how the session left each file. There is no
 * second store of "after" — and so there are cases where one side is not known, and the answer
 * **says** which side and why rather than inventing it.
 */

/**
 * The change of a tool call whose diff can be shown: it writes one file, and says how — a `write`
 * with its content, or an `edit` with its replacements (plan 28, B-16). A cell of a notebook is an
 * `edit` with no replacements, and has no diff; neither has a kind that changes no file.
 */
export function diffableChangeOf(tool: Pick<CanonicalTool, 'changes'>): EngineFileChange | null {
  return (
    tool.changes.find(
      (change) => change.op === 'write' || (change.op === 'edit' && change.edits !== undefined),
    ) ?? null
  );
}

/** What is known of the file before the tool ran. */
export type DiffBefore =
  | { readonly state: 'content'; readonly content: string }
  | { readonly state: 'absent' }
  | {
      readonly state: 'unavailable';
      /**
       * `laterTouch` — not the first write of the turn to the file, and the snapshot is of the start
       * of the turn; `noSnapshot` — the journal kept nothing for it.
       */
      readonly reason: 'laterTouch' | 'noSnapshot';
    }
  | { readonly state: 'notRestorable'; readonly reason: 'tooLarge' | 'unreadable' };

/** What is known of the file after the tool ran — or, on a pending call, after it would run. */
export type DiffAfter =
  | { readonly state: 'content'; readonly content: string }
  | {
      readonly state: 'unavailable';
      /** `laterWrite` — the session wrote the file again since; `changedSince` — somebody else did. */
      readonly reason: 'laterWrite' | 'changedSince';
    }
  | {
      readonly state: 'unavailable';
      /**
       * A pending edit that would not apply to the file as it is: `editMissing` — the text to replace
       * is not there; `editAmbiguous` — it is there more than once, and the edit replaces one.
       */
      readonly reason: 'editMissing' | 'editAmbiguous';
      /** Which replacement, from 0, in the order the call has them. */
      readonly edit: number;
    };

/** The diff of one tool invocation. */
export interface ToolDiff {
  readonly path: string;
  /** The kind of the call — `file.edit` or `file.write`. */
  readonly kind: ToolKind;
  /**
   * Whether the call is still waiting for an answer: the diff is then of what it **would** do, the
   * disk now against the disk with the change applied (B-17).
   */
  readonly pending: boolean;
  /**
   * `file` — the hunks are of the whole file, before against after; `edit` — they are of the
   * strings the tool replaced, because one side of the file is not known.
   */
  readonly scope: 'file' | 'edit';
  readonly before: DiffBefore;
  readonly after: DiffAfter;
  readonly hunks: readonly DiffHunk[];
}

/** The snapshot of the turn, as far as the text of it is known. */
export type SnapshotText =
  | { readonly kind: 'text'; readonly content: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'notRestorable'; readonly reason: 'tooLarge' | 'unreadable' }
  | { readonly kind: 'missing' };

/** The disk now, as far as the text of it is known. */
export type DiskText =
  | { readonly kind: 'text'; readonly content: string; readonly asLeft: boolean }
  | { readonly kind: 'other' };

/** Everything the diff of a tool is decided from. */
export interface ToolDiffFacts {
  readonly kind: ToolKind;
  /** The change, from {@link diffableChangeOf}. */
  readonly change: EngineFileChange;
  /** No earlier write of the same turn reached the file: the snapshot is its "before". */
  readonly firstTouchInTurn: boolean;
  /** No later write of the session reached the file: the disk may be its "after". */
  readonly lastWrite: boolean;
  readonly snapshot: SnapshotText;
  readonly disk: DiskText;
}

/**
 * The diff of a tool invocation (B-25).
 *
 * - **before** is the snapshot of the turn — but only for the first write of the turn to the file:
 *   a second edit started from what the first left, which nobody kept (S-106);
 * - **after** is the content of a `write`, or — for an edit — the disk, only while it is still
 *   what the session left **and** no later write of the session touched the file;
 * - **the hunks** are of the whole file when both sides are known; otherwise, of an edit, of the
 *   strings it replaced — one hunk per edit, in order (S-104); a `write` with no "before" has none.
 */
export function toolDiffOf(facts: ToolDiffFacts): ToolDiff {
  const before = beforeOf(facts);
  const after = afterOf(facts);
  const known = textOf(before);
  const head = { path: facts.change.path, kind: facts.kind, pending: false };

  if (known !== null && after.state === 'content') {
    return { ...head, scope: 'file', before, after, hunks: hunksBetween(known, after.content) };
  }

  return { ...head, scope: 'edit', before, after, hunks: snippetsOf(facts.change) };
}

/** The disk now, for the diff of a pending call. */
export type PendingDisk =
  | { readonly kind: 'text'; readonly content: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'notRestorable'; readonly reason: 'tooLarge' | 'unreadable' };

/**
 * The diff of a call still waiting for an answer: the file as it is now against the file with the
 * change applied, the way the agent applies it — each replacement on the text the one before left, a
 * text that is not there or is there twice (without "every occurrence") refused (plan 28, B-17).
 *
 * The preview a client used to compute from the raw input, moved to where the change is read — so
 * every client gets the same, and none reads the input (D-04). A file that is not text, or a refused
 * replacement, gives the hunks of the replaced strings, as an applied edit with no "before" does.
 */
export function pendingDiffOf(
  kind: ToolKind,
  change: EngineFileChange,
  disk: PendingDisk,
): ToolDiff {
  const head = { path: change.path, kind, pending: true };
  const before: DiffBefore =
    disk.kind === 'text'
      ? { state: 'content', content: disk.content }
      : disk.kind === 'absent'
        ? { state: 'absent' }
        : { state: 'notRestorable', reason: disk.reason };
  const now = textOf(before);
  const after = now === null ? null : appliedTo(now, change);

  if (now !== null && after !== null && after.state === 'content') {
    return { ...head, scope: 'file', before, after, hunks: hunksBetween(now, after.content) };
  }

  return {
    ...head,
    scope: 'edit',
    before,
    after: after ?? { state: 'unavailable', reason: 'changedSince' },
    hunks: snippetsOf(change),
  };
}

/** [text] with [change] applied — or why one of its replacements would not apply. */
function appliedTo(text: string, change: EngineFileChange): DiffAfter {
  if (change.op === 'write') {
    return { state: 'content', content: change.content ?? '' };
  }

  let result = text;

  for (const [index, edit] of (change.edits ?? []).entries()) {
    const found = occurrences(result, edit.oldText);

    if (found === 0) {
      return { state: 'unavailable', reason: 'editMissing', edit: index };
    }

    if (found > 1 && edit.replaceAll !== true) {
      return { state: 'unavailable', reason: 'editAmbiguous', edit: index };
    }

    result =
      edit.replaceAll === true
        ? result.split(edit.oldText).join(edit.newText)
        : result.replace(edit.oldText, () => edit.newText);
  }

  return { state: 'content', content: result };
}

/** How many times [needle] is in [text], without overlaps; never for an empty needle. */
function occurrences(text: string, needle: string): number {
  return needle === '' ? 0 : text.split(needle).length - 1;
}

function beforeOf(facts: ToolDiffFacts): DiffBefore {
  if (!facts.firstTouchInTurn) {
    return { state: 'unavailable', reason: 'laterTouch' };
  }

  switch (facts.snapshot.kind) {
    case 'text':
      return { state: 'content', content: facts.snapshot.content };
    case 'absent':
      return { state: 'absent' };
    case 'notRestorable':
      return { state: 'notRestorable', reason: facts.snapshot.reason };
    default:
      return { state: 'unavailable', reason: 'noSnapshot' };
  }
}

function afterOf(facts: ToolDiffFacts): DiffAfter {
  if (facts.change.op === 'write') {
    return { state: 'content', content: facts.change.content ?? '' };
  }

  if (!facts.lastWrite) {
    return { state: 'unavailable', reason: 'laterWrite' };
  }

  return facts.disk.kind === 'text' && facts.disk.asLeft
    ? { state: 'content', content: facts.disk.content }
    : { state: 'unavailable', reason: 'changedSince' };
}

/** The text of a side, when it is known: an absent file is empty. */
function textOf(before: DiffBefore): string | null {
  if (before.state === 'content') {
    return before.content;
  }

  return before.state === 'absent' ? '' : null;
}

/** One hunk per replacement of an edit, of the strings alone; none for a `write`. */
function snippetsOf(change: EngineFileChange): DiffHunk[] {
  return (change.edits ?? []).flatMap(({ oldText, newText }) => {
    const hunk = snippetHunk(oldText, newText);
    return hunk === null ? [] : [hunk];
  });
}

/** What a session did to one file, against before the session. */
export type ChangeKind = 'created' | 'modified' | 'deleted';

/** One file of what a session changed, as the list of changes shows it (B-26). */
export interface FileChange {
  readonly path: string;
  readonly kind: ChangeKind;

  /** The turn that first touched the file — what rejecting the whole file goes back to. */
  readonly promptId: string;

  /**
   * What is there is not what the session left: somebody changed it after — or nothing records
   * how the session left it. Rejecting it whole then preserves it, and a hunk cannot be rejected.
   */
  readonly modifiedOutside: boolean;
}

/**
 * What a session changed in one file, or `null` when the file is back to how it was before the
 * session — or was never there and still is not.
 *
 * @param first the snapshot of the first turn that touched the path: its state before the session
 */
export function fileChangeOf(
  first: TurnFileCheckpoint,
  baseline: SessionFileState | null,
  now: FileObservation,
): FileChange | null {
  const kind = kindOf(first, now);

  if (kind === null) {
    return null;
  }

  return {
    path: first.path,
    kind,
    promptId: first.promptId,
    modifiedOutside: !isAsLeft(baseline, now),
  };
}

function kindOf(first: TurnFileCheckpoint, now: FileObservation): ChangeKind | null {
  if (first.existedBefore === 'absent') {
    return now.kind === 'absent' ? null : 'created';
  }

  if (now.kind === 'absent') {
    return 'deleted';
  }

  return now.kind === 'file' && first.hash !== null && now.hash === first.hash ? null : 'modified';
}

/**
 * The snapshot each path had before the session — the one of the **first** turn that touched it,
 * across every session of the reach.
 */
export function firstCheckpoints(
  checkpoints: readonly TurnFileCheckpoint[],
): Map<string, TurnFileCheckpoint> {
  const first = new Map<string, TurnFileCheckpoint>();

  for (const checkpoint of checkpoints) {
    const known = first.get(checkpoint.path);

    if (known === undefined || isEarlier(checkpoint, known)) {
      first.set(checkpoint.path, checkpoint);
    }
  }

  return first;
}

/** Earlier by the time it was taken, and by turn when two were taken in the same instant. */
function isEarlier(candidate: TurnFileCheckpoint, known: TurnFileCheckpoint): boolean {
  const difference = candidate.capturedAt.getTime() - known.capturedAt.getTime();
  return difference < 0 || (difference === 0 && candidate.promptId < known.promptId);
}
