import type { SessionFileState } from '../entities/session-file-state.entity';
import type { TurnFileCheckpoint } from '../entities/turn-file-checkpoint.entity';
import { RewindTargetUnknownError } from '../errors/rewind-target-unknown.error';
import { isAsLeft } from './file-state';
import type { FileObservation } from './file-state';

export type { FileObservation } from './file-state';

/** Why a path is left as it is. The contract carries the same four. */
export type PreservationReason = 'modifiedOutside' | 'notRestorable' | 'unsafePath' | 'noBaseline';

/** What the undo does to one path. */
export type FileVerdict =
  | {
      readonly path: string;
      readonly outcome: 'revert';
      /** `delete` for a file the turn created: before it, there was nothing there. */
      readonly action: 'restore' | 'delete';
      readonly checkpoint: TurnFileCheckpoint;
    }
  | { readonly path: string; readonly outcome: 'preserve'; readonly reason: PreservationReason }
  | { readonly path: string; readonly outcome: 'unchanged' };

/**
 * A point the files can go back to: the moment **before** a turn began.
 *
 * It reaches every path that turn **or any later one** touched — "back to before this turn" is a
 * point in time, and a file a later turn wrote is not the way it was then either. Each path goes
 * back to the snapshot of the **first** of those turns that touched it, which is the state at the
 * start of the point.
 */
export interface UndoPoint {
  readonly promptId: string;

  /** The prompt of the turn: what a person recognises. `null` when the hook carried none. */
  readonly label: string | null;
  readonly at: Date;

  /** One per path the point reaches, sorted by path. */
  readonly checkpoints: readonly TurnFileCheckpoint[];
}

/** One turn and what it touched, while the points are being assembled. */
interface Turn {
  readonly promptId: string;
  readonly label: string | null;
  readonly at: Date;
  readonly checkpoints: readonly TurnFileCheckpoint[];
}

/**
 * The undo points of a session — or of the conversation, when it was continued in place — newest
 * first.
 *
 * A turn that touched no file is not a point: there is nothing it could put back. The order of the
 * turns is the order of their first snapshot, the only time the journal has for a turn; two turns
 * at the same instant are ordered by id, so the answer does not depend on the order rows came back.
 */
export function undoPointsOf(checkpoints: readonly TurnFileCheckpoint[]): UndoPoint[] {
  const turns = turnsOf(checkpoints);
  const points: UndoPoint[] = [];
  const reach = new Map<string, TurnFileCheckpoint>();

  // Walked from the newest turn back, so that by the time a turn is reached `reach` holds, for
  // every path touched from that turn on, the snapshot of the earliest turn that touched it.
  for (const turn of [...turns].reverse()) {
    for (const checkpoint of turn.checkpoints) {
      reach.set(checkpoint.path, checkpoint);
    }

    points.push({
      promptId: turn.promptId,
      label: turn.label,
      at: turn.at,
      checkpoints: [...reach.values()].sort((left, right) => left.path.localeCompare(right.path)),
    });
  }

  return points;
}

/** The turns, oldest first. */
function turnsOf(checkpoints: readonly TurnFileCheckpoint[]): Turn[] {
  const byPrompt = new Map<string, TurnFileCheckpoint[]>();

  for (const checkpoint of checkpoints) {
    const group = byPrompt.get(checkpoint.promptId) ?? [];
    group.push(checkpoint);
    byPrompt.set(checkpoint.promptId, group);
  }

  return [...byPrompt.entries()]
    .map(([promptId, group]) => ({
      promptId,
      label: group.find((checkpoint) => checkpoint.promptText !== null)?.promptText ?? null,
      at: new Date(Math.min(...group.map((checkpoint) => checkpoint.capturedAt.getTime()))),
      checkpoints: group,
    }))
    .sort(
      (left, right) =>
        left.at.getTime() - right.at.getTime() || left.promptId.localeCompare(right.promptId),
    );
}

/**
 * The point `promptId` names.
 *
 * @throws {RewindTargetUnknownError} it is not an undo point of this reach — a turn of another
 *   session, a turn that touched nothing, or no turn at all (S-61)
 */
export function undoPointNamed(points: readonly UndoPoint[], promptId: string): UndoPoint {
  const point = points.find((candidate) => candidate.promptId === promptId);

  if (point === undefined) {
    throw new RewindTargetUnknownError(promptId);
  }

  return point;
}

/**
 * What going back to `checkpoint` does to its path, given how the session last left it and what is
 * there now.
 *
 * The order of the questions is the design, and each one is there because of what the SDK did not
 * do ([D-06](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir)):
 *
 * 1. **already there** — the path is the way it was at the point. Nothing to do, and what makes a
 *    second undo to the same point idempotent (S-41);
 * 2. **unsafe** — a link, or no longer a regular file: refused, never written through (S-65);
 * 3. **not restorable** — too large or unreadable to snapshot: the undo cannot promise it;
 * 4. **no baseline** — nothing says how the session left it, so nothing says the session was the
 *    last to touch it. Conservative, and the reason is said out loud;
 * 5. **modified outside** — what is there is not what the session left: somebody edited it after.
 *    **Preserved**, where `rewindFiles()` would have overwritten it in silence (S-63);
 * 6. otherwise — exactly what the session left: it goes back.
 */
export function verdictFor(
  checkpoint: TurnFileCheckpoint,
  baseline: SessionFileState | null,
  now: FileObservation,
): FileVerdict {
  const { path } = checkpoint;

  if (isAtPoint(checkpoint, now)) {
    return { path, outcome: 'unchanged' };
  }

  if (now.kind === 'unsafe') {
    return { path, outcome: 'preserve', reason: 'unsafePath' };
  }

  if (!checkpoint.canBeRestored) {
    return { path, outcome: 'preserve', reason: 'notRestorable' };
  }

  if (baseline === null) {
    return { path, outcome: 'preserve', reason: 'noBaseline' };
  }

  if (!isAsLeft(baseline, now)) {
    return { path, outcome: 'preserve', reason: 'modifiedOutside' };
  }

  return {
    path,
    outcome: 'revert',
    action: checkpoint.existedBefore === 'absent' ? 'delete' : 'restore',
    checkpoint,
  };
}

/**
 * What going back to `point` does to every path it reaches.
 *
 * @param baselines how the session — or the conversation — last left each path, by path
 * @param observed what is at each path now, by path; a path missing here is treated as unsafe,
 *   because a path nobody could look at is not one to write
 */
export function planFor(
  point: UndoPoint,
  baselines: ReadonlyMap<string, SessionFileState>,
  observed: ReadonlyMap<string, FileObservation>,
): FileVerdict[] {
  return point.checkpoints.map((checkpoint) =>
    verdictFor(
      checkpoint,
      baselines.get(checkpoint.path) ?? null,
      observed.get(checkpoint.path) ?? { kind: 'unsafe' },
    ),
  );
}

/**
 * How each path was last left, across every session of the reach: the newest state wins.
 *
 * A conversation continued in place is several live sessions on one conversation, and each of them
 * kept its own row per path; the one written last is how the path was left.
 */
export function latestBaselines(
  states: readonly SessionFileState[],
): Map<string, SessionFileState> {
  const latest = new Map<string, SessionFileState>();

  for (const state of states) {
    const known = latest.get(state.path);

    if (known === undefined || state.updatedAt.getTime() > known.updatedAt.getTime()) {
      latest.set(state.path, state);
    }
  }

  return latest;
}

/** Whether the path already is the way it was at the point. */
function isAtPoint(checkpoint: TurnFileCheckpoint, now: FileObservation): boolean {
  if (checkpoint.existedBefore === 'absent') {
    return now.kind === 'absent';
  }

  return now.kind === 'file' && checkpoint.hash !== null && now.hash === checkpoint.hash;
}
