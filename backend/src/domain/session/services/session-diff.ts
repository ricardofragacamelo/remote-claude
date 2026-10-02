import type { SessionFileState } from '../entities/session-file-state.entity';
import type { TurnFileCheckpoint } from '../entities/turn-file-checkpoint.entity';
import { hunksBetween, snippetHunk } from './line-diff';
import type { DiffHunk } from './line-diff';
import { isAsLeft } from './file-state';
import type { FileObservation } from './file-state';

/**
 * What the diffs of a session are made of — plan 08, F3.
 *
 * The diff is ours, out of what the undo already keeps ([D-03](../../../../../docs/plans/08-claude-panel/decisions.md#d-03--de-onde-vem-o-diff)):
 * the input of the tool, the snapshot of the turn and how the session left each file. There is no
 * second store of "after" — and so there are cases where one side is not known, and the answer
 * **says** which side and why rather than inventing it.
 */

/** The tools whose diff can be shown: they write one file, and their input says how. */
export const DIFFABLE_TOOLS = ['Edit', 'MultiEdit', 'Write'] as const;

export type DiffableTool = (typeof DIFFABLE_TOOLS)[number];

export function isDiffableTool(toolName: string): toolName is DiffableTool {
  return (DIFFABLE_TOOLS as readonly string[]).includes(toolName);
}

/** The file a diffable tool writes, from its input — `null` when the input names none, or a relative one. */
export function diffablePathOf(input: Readonly<Record<string, unknown>>): string | null {
  const path = input['file_path'];
  return typeof path === 'string' && path.startsWith('/') ? path : null;
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

/** What is known of the file after the tool ran. */
export type DiffAfter =
  | { readonly state: 'content'; readonly content: string }
  | {
      readonly state: 'unavailable';
      /** `laterWrite` — the session wrote the file again since; `changedSince` — somebody else did. */
      readonly reason: 'laterWrite' | 'changedSince';
    };

/** The diff of one tool invocation. */
export interface ToolDiff {
  readonly path: string;
  readonly toolName: DiffableTool;

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
  readonly toolName: DiffableTool;
  readonly path: string;
  readonly input: Readonly<Record<string, unknown>>;

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
 *   a second `Edit` started from what the first left, which nobody kept (S-106);
 * - **after** is the `content` of a `Write`, or — for an edit — the disk, only while it is still
 *   what the session left **and** no later write of the session touched the file;
 * - **the hunks** are of the whole file when both sides are known; otherwise, of an edit, of the
 *   strings it replaced — one hunk per edit, in order (S-104); a `Write` with no "before" has none.
 */
export function toolDiffOf(facts: ToolDiffFacts): ToolDiff {
  const before = beforeOf(facts);
  const after = afterOf(facts);
  const known = textOf(before);

  if (known !== null && after.state === 'content') {
    return {
      path: facts.path,
      toolName: facts.toolName,
      scope: 'file',
      before,
      after,
      hunks: hunksBetween(known, after.content),
    };
  }

  return {
    path: facts.path,
    toolName: facts.toolName,
    scope: 'edit',
    before,
    after,
    hunks: editsOf(facts.toolName, facts.input).flatMap(({ from, to }) => {
      const hunk = snippetHunk(from, to);
      return hunk === null ? [] : [hunk];
    }),
  };
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
  if (facts.toolName === 'Write') {
    const content = facts.input['content'];
    return { state: 'content', content: typeof content === 'string' ? content : '' };
  }

  if (!facts.lastWrite) {
    return { state: 'unavailable', reason: 'laterWrite' };
  }

  return facts.disk.kind === 'text' && facts.disk.asLeft
    ? { state: 'content', content: facts.disk.content }
    : { state: 'unavailable', reason: 'changedSince' };
}

/** The text of a "before" that is known — an absent file is the empty text. */
function textOf(before: DiffBefore): string | null {
  if (before.state === 'content') {
    return before.content;
  }

  return before.state === 'absent' ? '' : null;
}

/** The replacements an edit asked for, in order. A `Write` asks for none. */
function editsOf(
  toolName: DiffableTool,
  input: Readonly<Record<string, unknown>>,
): { readonly from: string; readonly to: string }[] {
  if (toolName === 'Edit') {
    return [replacementOf(input)];
  }

  if (toolName === 'MultiEdit' && Array.isArray(input['edits'])) {
    return (input['edits'] as unknown[]).flatMap((edit) =>
      typeof edit === 'object' && edit !== null
        ? [replacementOf(edit as Readonly<Record<string, unknown>>)]
        : [],
    );
  }

  return [];
}

function replacementOf(edit: Readonly<Record<string, unknown>>): {
  readonly from: string;
  readonly to: string;
} {
  const from = edit['old_string'];
  const to = edit['new_string'];
  return { from: typeof from === 'string' ? from : '', to: typeof to === 'string' ? to : '' };
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
