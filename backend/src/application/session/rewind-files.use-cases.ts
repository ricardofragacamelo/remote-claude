import type { RecordAuditEventUseCase } from '@application/audit';
import type { PathLock } from '@application/shared';
import type { UserId } from '@domain/auth';
import type { Clock } from '@domain/shared';
import {
  latestBaselines,
  planFor,
  RewindPathUnknownError,
  SessionFileState,
  SessionId,
  undoPointNamed,
  undoPointsOf,
} from '@domain/session';
import type {
  FileObservation,
  FileVerdict,
  PreservationReason,
  SessionFileState as Baseline,
  UndoPoint,
} from '@domain/session';
import type { UndoDisk, UndoJournal, UndoReach } from './ports/undo.ports';
import type { SessionChangeMemory } from './session-change-memory';
import type { LiveSession, SessionRegistry } from './session-registry';

/** How many undo points the preview answers: the newest ones. A long session has many turns. */
export const MAX_UNDO_POINTS = 50;

/** One path of a preview: what the undo would do to it now. The checkpoint stays on this side. */
export type FilePreview =
  | { readonly path: string; readonly outcome: 'revert'; readonly action: 'restore' | 'delete' }
  | { readonly path: string; readonly outcome: 'preserve'; readonly reason: PreservationReason }
  | { readonly path: string; readonly outcome: 'unchanged' };

/** An undo point, with what going back to it would do to each file — computed now, not stored. */
export interface UndoPointPreview {
  readonly promptId: string;
  readonly label: string | null;
  readonly at: Date;
  readonly files: readonly FilePreview[];
}

/** What an undo did, path by path — never a boolean. The contract's `session.rewound`. */
export interface RewindOutcome {
  readonly promptId: string;
  readonly reverted: readonly { readonly path: string; readonly action: 'restored' | 'deleted' }[];
  readonly preserved: readonly { readonly path: string; readonly reason: PreservationReason }[];
  readonly unchanged: readonly { readonly path: string }[];
  readonly failed: readonly { readonly path: string }[];

  /** Set when only one hunk of one file went back — `session.rejectChange` (plan 08, B-31). */
  readonly hunkId?: string;
}

/** What undoing needs to be asked. */
export interface RewindFilesCommand {
  readonly sessionId: string;
  readonly promptId: string;
  readonly userId: UserId;

  /**
   * Only these files of what the point reaches — rejecting one file of what a session changed
   * (plan 08, B-30). Absent is every file.
   */
  readonly paths?: readonly string[];
}

/**
 * The undo points of a session and what each would do — plan 04, B-19.
 *
 * The confirmation shows **which files go back, which stay and to which point** because a
 * confirmation without the list is a confirmation without information. The list is our own diff
 * between the snapshot, how the session left the file and what is on disk now — never the
 * `dryRun` of `rewindFiles()`, which reported a destructive revert as a trivial one
 * ([D-06](../../../../docs/plans/04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir)).
 */
export class ListUndoPointsUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly planner: UndoPlanner,
  ) {}

  /**
   * @throws {import('@domain/session').SessionNotFoundError} unknown or closed (S-39)
   * @throws {import('@domain/session').SessionForbiddenError} somebody else's
   */
  async execute(rawSessionId: string, userId: UserId): Promise<readonly UndoPointPreview[]> {
    const live = this.registry.require(SessionId.create(rawSessionId), userId);
    const points = (await this.planner.pointsOf(live)).slice(0, MAX_UNDO_POINTS);
    const plans = await this.planner.plansFor(live, points);

    return points.map((point, index) => ({
      promptId: point.promptId,
      label: point.label,
      at: point.at,
      files: (plans[index] ?? []).map(toPreview),
    }));
  }
}

/**
 * Puts the files a session wrote back the way they were before a turn — plan 04, B-18…B-21.
 *
 * The mechanism is ours and not `rewindFiles()`, which overwrites a manual edit in silence and takes
 * no file filter. What the rules below are for:
 *
 * - **only what the session reached** (S-40) — the paths its turns snapshotted, and no other;
 * - **not during a turn** (S-43) — the files would change underneath a model reading them. Nor two
 *   undos of one session at once: the second would plan against a disk the first is rewriting;
 * - **not on a session that ended** (S-39) — a policy, not a limitation: the store is ours and does
 *   not need the subprocess, but the undo is offered where the work is happening;
 * - **the trail first** (S-42) — the point, and every path with what will happen to it, before a
 *   single byte is written. A trail that cannot take it is an undo that does not happen;
 * - **a failure stops nothing half-written** (S-44, S-62, S-66) — each path is written atomically,
 *   a path that fails is reported as failed, and the others still go back.
 */
export class RewindFilesUseCase {
  /**
   * @param memory where a rejection of one file keeps what it replaced, so it can be undone
   *   (plan 08, B-30) — absent, nothing is kept
   */
  constructor(
    private readonly registry: SessionRegistry,
    private readonly planner: UndoPlanner,
    private readonly trail: RecordAuditEventUseCase,
    private readonly clock: Clock,
    private readonly memory: SessionChangeMemory | null = null,
  ) {}

  /**
   * @throws {import('@domain/session').SessionNotFoundError} unknown or closed (S-39)
   * @throws {import('@domain/session').SessionForbiddenError} somebody else's
   * @throws {import('@domain/session').SessionLockedError} a turn is running, or another undo of
   *   this session is (S-43)
   * @throws {import('@domain/session').RewindTargetUnknownError} not a point of this session (S-61)
   * @throws {RewindPathUnknownError} a path of `paths` the point does not reach (plan 08, S-136)
   * @throws whatever the trail threw — and then nothing on disk was touched
   */
  async execute(command: RewindFilesCommand): Promise<RewindOutcome> {
    const live = this.registry.require(SessionId.create(command.sessionId), command.userId);

    // The lock lives on the session, not here: a prompt arriving while the files go back has to be
    // able to see it too (B-27).
    live.session.beginRewind();

    try {
      return await this.rewind(live, command);
    } finally {
      live.session.endRewind();
    }
  }

  private async rewind(live: LiveSession, command: RewindFilesCommand): Promise<RewindOutcome> {
    const point = undoPointNamed(await this.planner.pointsOf(live), command.promptId);
    const [whole = []] = await this.planner.plansFor(live, [point]);
    const plan = command.paths === undefined ? whole : only(whole, command.paths);

    await recordFilesRewound(
      { trail: this.trail, clock: this.clock },
      { live, userId: command.userId, promptId: point.promptId },
      {
        files: plan.map(toPreview),
        ...(command.paths === undefined ? {} : { paths: command.paths }),
      },
    );

    const reverted: { path: string; action: 'restored' | 'deleted' }[] = [];
    const failed: { path: string }[] = [];

    for (const verdict of plan) {
      if (verdict.outcome !== 'revert') {
        continue;
      }

      if (await this.revert(live, verdict, command.paths !== undefined)) {
        reverted.push({
          path: verdict.path,
          action: verdict.action === 'delete' ? 'deleted' : 'restored',
        });
      } else {
        failed.push({ path: verdict.path });
      }
    }

    return {
      promptId: point.promptId,
      reverted,
      preserved: plan.flatMap((verdict) =>
        verdict.outcome === 'preserve' ? [{ path: verdict.path, reason: verdict.reason }] : [],
      ),
      unchanged: plan.flatMap((verdict) =>
        verdict.outcome === 'unchanged' ? [{ path: verdict.path }] : [],
      ),
      failed,
    };
  }

  /**
   * Puts one path back. A rejection of chosen files keeps what it replaces, for its undo: what is
   * there now is what the session left, or the verdict would not be a revert.
   */
  private async revert(
    live: LiveSession,
    verdict: Extract<FileVerdict, { outcome: 'revert' }>,
    rejecting: boolean,
  ): Promise<boolean> {
    const memory = rejecting ? this.memory : null;
    const replaced = memory === null ? null : await this.planner.bytesAt(verdict.path);

    if (!(await this.planner.apply(live, verdict))) {
      return false;
    }

    memory?.rememberRejection(live.session, {
      path: verdict.path,
      promptId: verdict.checkpoint.promptId,
      replaced,
      left: verdict.action === 'delete' ? null : verdict.checkpoint.hash,
    });

    return true;
  }
}

/**
 * The part the preview and the undo share: what a session reaches, what each point would do, and
 * doing it to one path.
 *
 * One class so the preview can never say something the undo then does differently — they are the
 * same function of the same three inputs: the snapshots, how the session left each file, and the
 * disk as it is.
 */
export class UndoPlanner {
  /**
   * @param lock the one the person's saves take too: an undo putting a file back and a person
   *   saving it from the editor wait for each other, so the disk ends with one whole version
   *   (plan 07, B-18, S-125)
   */
  constructor(
    private readonly journal: UndoJournal,
    private readonly disk: UndoDisk,
    private readonly clock: Clock,
    private readonly lock: PathLock,
  ) {}

  /** The points of the session's reach, newest first. */
  async pointsOf(live: LiveSession): Promise<UndoPoint[]> {
    return undoPointsOf(await this.journal.checkpointsOf(reachOf(live)));
  }

  /**
   * What each of `points` would do now, in the same order.
   *
   * Every path is looked at **once**, however many points reach it: the preview of fifty points
   * must not hash the same file fifty times.
   */
  async plansFor(live: LiveSession, points: readonly UndoPoint[]): Promise<FileVerdict[][]> {
    const baselines = latestBaselines(await this.journal.baselinesOf(reachOf(live)));
    const paths = new Set(points.flatMap((point) => point.checkpoints.map((c) => c.path)));
    const observed = new Map<string, FileObservation>();

    for (const path of paths) {
      observed.set(path, await this.disk.observe(path));
    }

    return points.map((point) => planFor(point, baselines, observed));
  }

  /**
   * Puts one path back and records how it was left, as the session's own write.
   *
   * @returns whether the path went back. A failure is the disk adapter's to log; here it becomes a
   *   path in `failed`, and the undo carries on with the rest. Recording the baseline never fails
   *   the path: the file is back either way, and a missing baseline only makes the next undo of it
   *   more conservative.
   */
  async apply(
    live: LiveSession,
    verdict: Extract<FileVerdict, { outcome: 'revert' }>,
  ): Promise<boolean> {
    let left: Pick<Baseline, 'hash' | 'mtime' | 'sizeBytes'>;

    try {
      left = await this.lock.run(verdict.path, () => this.putBack(verdict));
    } catch {
      return false;
    }

    await this.journal.recordBaseline(
      SessionFileState.record({
        sessionId: live.session.id,
        claudeSessionId: live.conversation.claudeSessionId,
        path: verdict.path,
        ...left,
        updatedAt: this.clock.now(),
      }),
    );

    return true;
  }

  /** What is at a path now, whole — `null` when it is not a regular file. */
  async bytesAt(path: string): Promise<Uint8Array | null> {
    const content = await this.disk.read(path, Number.MAX_SAFE_INTEGER);
    return content.kind === 'file' ? content.bytes : null;
  }

  /** The disk half of {@link apply}, run under the lock of the path. */
  private async putBack(
    verdict: Extract<FileVerdict, { outcome: 'revert' }>,
  ): Promise<Pick<Baseline, 'hash' | 'mtime' | 'sizeBytes'>> {
    if (verdict.action === 'delete') {
      await this.disk.remove(verdict.path);
      return { hash: null, mtime: this.clock.now(), sizeBytes: 0 };
    }

    return { hash: verdict.checkpoint.hash, ...(await this.disk.restore(verdict.checkpoint)) };
  }
}

/**
 * Writes `session.filesRewound` to the trail — before the disk is touched, by the undo and by every
 * rejection alike (plan 08, B-30, B-31): the point, the session and the conversation, and what
 * `details` adds — paths and hunks, never a byte of a file.
 *
 * @throws whatever the trail threw — and then the caller touches nothing
 */
export async function recordFilesRewound(
  writing: { readonly trail: RecordAuditEventUseCase; readonly clock: Clock },
  about: { readonly live: LiveSession; readonly userId: UserId; readonly promptId: string },
  details: Readonly<Record<string, unknown>>,
): Promise<void> {
  const { live } = about;

  await writing.trail.execute({
    userId: about.userId,
    kind: 'session.filesRewound',
    subjectId: about.promptId,
    subjectLabel: live.session.workspace.value,
    details: {
      sessionId: live.session.id.value,
      claudeSessionId: live.conversation.claudeSessionId.value,
      ...details,
    },
    at: writing.clock.now(),
  });
}

/** What a live session reaches: itself, and the conversation it is. */
export function reachOf(live: LiveSession): UndoReach {
  return { sessionId: live.session.id, claudeSessionId: live.conversation.claudeSessionId };
}

/**
 * The verdicts of the chosen paths, in the order of the plan.
 *
 * @throws {RewindPathUnknownError} a path the plan does not reach — never silently skipped
 */
function only(plan: readonly FileVerdict[], paths: readonly string[]): FileVerdict[] {
  const reached = new Set(plan.map((verdict) => verdict.path));
  const unknown = paths.find((path) => !reached.has(path));

  if (unknown !== undefined) {
    throw new RewindPathUnknownError(unknown);
  }

  const chosen = new Set(paths);
  return plan.filter((verdict) => chosen.has(verdict.path));
}

/** A verdict without the checkpoint behind it — what leaves this layer. */
function toPreview(verdict: FileVerdict): FilePreview {
  switch (verdict.outcome) {
    case 'revert':
      return { path: verdict.path, outcome: 'revert', action: verdict.action };
    case 'preserve':
      return { path: verdict.path, outcome: 'preserve', reason: verdict.reason };
    default:
      return { path: verdict.path, outcome: 'unchanged' };
  }
}
