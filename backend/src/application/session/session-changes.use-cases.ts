import type { RecordAuditEventUseCase } from '@application/audit';
import type { PathLock } from '@application/shared';
import type { UserId } from '@domain/auth';
import { FileNotTextError, isUtf8, looksBinary } from '@domain/files';
import type { Clock } from '@domain/shared';
import {
  DiffNotApplicableError,
  diffablePathOf,
  fileChangeOf,
  firstCheckpoints,
  hunksBetween,
  isAsLeft,
  isDiffableTool,
  latestBaselines,
  lineCounts,
  SessionChangeNotFoundError,
  SessionChangeStaleError,
  SessionFileState,
  SessionId,
  toolDiffOf,
  ToolUseNotFoundError,
  withHunkReverted,
} from '@domain/session';
import type {
  ChangeKind,
  DiffHunk,
  DiskText,
  FileChange,
  FileObservation,
  SnapshotText,
  ToolDiff,
  TurnFileCheckpoint,
} from '@domain/session';
import { WorkspaceNotAllowedError } from '@domain/workspace';
import type { FileContent, UndoDisk, UndoJournal, UndoReach } from './ports/undo.ports';
import { reachOf, recordFilesRewound } from './rewind-files.use-cases';
import type { RewindOutcome } from './rewind-files.use-cases';
import type { SessionChangeMemory } from './session-change-memory';
import type { LiveSession, SessionRegistry } from './session-registry';

/** How large a file the diffs read — the ceiling of a snapshot, so both sides are judged alike. */
export interface ChangeLimits {
  readonly maxFileBytes: number;
}

/** What the revision of a file is when there is no file: a deleted one still has hunks. */
export const ABSENT_REVISION = 'absent';

/** One file of what a session changed, with how much (B-26). */
export interface SessionChangeSummary extends FileChange {
  /** Lines added and removed against before the session — `null` when either side is not text. */
  readonly added: number | null;
  readonly removed: number | null;

  /** The hash of the disk when listed — what a mark of review is of, so a later change is new. */
  readonly revision: string;
}

/** The changes of a session: the first turn it reached, and each file. */
export interface SessionChanges {
  /** The first turn that touched a file — what "reject everything" goes back to; `null` for none. */
  readonly promptId: string | null;
  readonly files: readonly SessionChangeSummary[];
}

/** One side of a file of the changes. */
export type ChangeSide =
  | { readonly state: 'content'; readonly content: string }
  | { readonly state: 'absent' }
  | { readonly state: 'notRestorable'; readonly reason: 'tooLarge' | 'unreadable' };

/** One file of the changes, whole: what a rejection of a hunk is computed against (B-26). */
export interface SessionChangeFile {
  readonly path: string;

  /** `null` when the file is back to how it was before the session. */
  readonly kind: ChangeKind | null;
  readonly promptId: string;
  readonly modifiedOutside: boolean;
  readonly before: ChangeSide;
  readonly now: ChangeSide;

  /** The hash of the disk the hunks were computed on — what `session.rejectChange` carries back. */
  readonly revision: string;
  readonly hunks: readonly DiffHunk[];
}

/** What rejecting a hunk needs to be asked. */
export interface RejectChangeCommand {
  readonly sessionId: string;
  readonly path: string;
  readonly hunkId: string;
  readonly revision: string;
  readonly userId: UserId;
}

/** What undoing a rejection needs to be asked. */
export interface RestoreChangeCommand {
  readonly sessionId: string;
  readonly path: string;
  readonly userId: UserId;
}

/** What the use cases of this file read and write with. */
export interface ChangeStores {
  readonly journal: UndoJournal;
  readonly disk: UndoDisk;
  readonly limits: ChangeLimits;
}

/** What the two writing use cases need besides the stores. */
export interface ChangeWriting {
  readonly lock: PathLock;
  readonly trail: RecordAuditEventUseCase;
  readonly clock: Clock;
}

/**
 * The diff of one tool invocation of a live session — plan 08, B-25.
 *
 * From the input the hook saw, the snapshot of its turn and the disk as the session left it; the
 * rule of which side is known is the domain's ({@link toolDiffOf}). Contents never reach the log —
 * the adapter at the edge logs the path and the sizes.
 */
export class ShowToolDiffUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly memory: SessionChangeMemory,
    private readonly stores: ChangeStores,
  ) {}

  /**
   * @throws {import('@domain/session').SessionNotFoundError} unknown or closed (S-110)
   * @throws {import('@domain/session').SessionForbiddenError} somebody else's (S-110)
   * @throws {ToolUseNotFoundError} an invocation this session does not have (S-108)
   * @throws {DiffNotApplicableError} a tool that writes no file (S-109)
   * @throws {FileNotTextError} a side that is not text (S-111)
   */
  async execute(rawSessionId: string, toolUseId: string, userId: UserId): Promise<ToolDiff> {
    const live = this.registry.require(SessionId.create(rawSessionId), userId);
    const tool = this.memory.toolOf(live.session, toolUseId);

    if (tool === null) {
      throw new ToolUseNotFoundError(toolUseId);
    }

    const path = diffablePathOf(tool.input);

    if (!isDiffableTool(tool.toolName) || path === null) {
      throw new DiffNotApplicableError(tool.toolName);
    }

    const reach = reachOf(live);
    const checkpoint = (await this.stores.journal.checkpointsOf(reach)).find(
      (candidate) =>
        candidate.sessionId.value === live.session.id.value &&
        candidate.promptId === tool.promptId &&
        candidate.path === path,
    );

    return toolDiffOf({
      toolName: tool.toolName,
      path,
      input: tool.input,
      firstTouchInTurn: tool.firstTouchInTurn,
      lastWrite: tool.lastWrite,
      snapshot: await this.snapshotText(checkpoint),
      // A `Write` says its own "after"; the disk is read only for an edit that may still be it.
      disk:
        tool.toolName !== 'Write' && tool.lastWrite
          ? await this.diskText(reach, path)
          : { kind: 'other' },
    });
  }

  private async snapshotText(checkpoint: TurnFileCheckpoint | undefined): Promise<SnapshotText> {
    if (checkpoint === undefined) {
      return { kind: 'missing' };
    }

    const side = await sideOf(checkpoint, this.stores.disk);

    if (side.state === 'content') {
      return { kind: 'text', content: side.content };
    }

    return side.state === 'absent'
      ? { kind: 'absent' }
      : { kind: 'notRestorable', reason: side.reason };
  }

  private async diskText(reach: UndoReach, path: string): Promise<DiskText> {
    const content = await this.stores.disk.read(path, this.stores.limits.maxFileBytes);

    if (content.kind !== 'file') {
      return { kind: 'other' };
    }

    const baseline =
      latestBaselines(await this.stores.journal.baselinesOf(reach)).get(path) ?? null;

    return {
      kind: 'text',
      content: textOf(path, content.bytes),
      asLeft: isAsLeft(baseline, observationOf(content)),
    };
  }
}

/**
 * What a live session changed, file by file, against before the session — plan 08, B-26.
 *
 * The reach of the undo: this session and the sessions before it of the same conversation,
 * continued in place. A file back to how it was before the session is not a change, and is left out.
 */
export class ListSessionChangesUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly stores: ChangeStores,
  ) {}

  /**
   * @throws {import('@domain/session').SessionNotFoundError} unknown or closed
   * @throws {import('@domain/session').SessionForbiddenError} somebody else's
   */
  async execute(rawSessionId: string, userId: UserId): Promise<SessionChanges> {
    const live = this.registry.require(SessionId.create(rawSessionId), userId);
    const reach = reachOf(live);
    const first = firstCheckpoints(await this.stores.journal.checkpointsOf(reach));
    const baselines = latestBaselines(await this.stores.journal.baselinesOf(reach));
    const files: SessionChangeSummary[] = [];

    for (const checkpoint of first.values()) {
      const content = await this.stores.disk.read(checkpoint.path, this.stores.limits.maxFileBytes);
      const change = fileChangeOf(
        checkpoint,
        baselines.get(checkpoint.path) ?? null,
        observationOf(content),
      );

      if (change !== null) {
        files.push({
          ...change,
          ...(await this.countsOf(checkpoint, content)),
          revision: content.kind === 'file' ? content.hash : ABSENT_REVISION,
        });
      }
    }

    return {
      promptId: firstPromptOf([...first.values()]),
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
    };
  }

  /** How many lines changed — or `null` for both when either side cannot be read as text. */
  private async countsOf(
    checkpoint: TurnFileCheckpoint,
    content: FileContent,
  ): Promise<{ added: number | null; removed: number | null }> {
    try {
      const before = await sideOf(checkpoint, this.stores.disk);
      const now = nowSideOf(checkpoint.path, content);

      if (before.state === 'notRestorable' || now.state === 'notRestorable') {
        return { added: null, removed: null };
      }

      return lineCounts(hunksBetween(sideText(before), sideText(now)));
    } catch {
      // A side that is not text has no lines to count; the file is still a change.
      return { added: null, removed: null };
    }
  }
}

/**
 * One file of the changes of a live session, whole — plan 08, B-26.
 *
 * The before of the session, the disk now, the hunks between them and the revision they were
 * computed on. A path that became a link is refused **without reading** (S-117); the read itself is
 * of one whole file, so a write landing meanwhile is seen before or after, never halfway (S-118).
 */
export class ReadSessionChangeUseCase {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly stores: ChangeStores,
  ) {}

  /**
   * @throws {SessionChangeNotFoundError} a path the session did not touch (S-116)
   * @throws {WorkspaceNotAllowedError} a path that became a link (S-117)
   * @throws {FileNotTextError} a side that is not text
   */
  async execute(rawSessionId: string, path: string, userId: UserId): Promise<SessionChangeFile> {
    const live = this.registry.require(SessionId.create(rawSessionId), userId);
    return readChange(live, path, this.stores);
  }
}

/**
 * What the two use cases that write a file of the changes share: the session, the locks of the undo
 * — no turn running, no other undo of the session (`SESSION_LOCKED`) — and the lock of the path,
 * the one the person's saves take too.
 */
abstract class ChangeWritingUseCase {
  constructor(
    protected readonly registry: SessionRegistry,
    protected readonly memory: SessionChangeMemory,
    protected readonly stores: ChangeStores,
    protected readonly writing: ChangeWriting,
  ) {}

  /**
   * Runs `body` on the caller's live session, holding its undo lock and the lock of the path.
   *
   * @throws {import('@domain/session').SessionLockedError} a turn or another undo is running
   */
  protected async locked<T>(
    command: { readonly sessionId: string; readonly path: string; readonly userId: UserId },
    body: (live: LiveSession) => Promise<T>,
  ): Promise<T> {
    const live = this.registry.require(SessionId.create(command.sessionId), command.userId);

    live.session.beginRewind();

    try {
      return await this.writing.lock.run(command.path, () => body(live));
    } finally {
      live.session.endRewind();
    }
  }
}

/**
 * Rejects one hunk of what a session changed in a file — plan 08, B-31.
 *
 * Only while the disk is still what the session left (otherwise the file is `modifiedOutside`, and
 * only rejecting it whole — which preserves it — is offered), and only against the revision the
 * hunks were computed on (S-139). The same locks as the undo, the trail before the disk, the write
 * atomic, and the baseline moved to what the rejection left: the rejection is the session's own
 * write, as the undo's is.
 */
export class RejectChangeUseCase extends ChangeWritingUseCase {
  /**
   * @throws {import('@domain/session').SessionLockedError} a turn or another undo is running
   * @throws {SessionChangeNotFoundError} a path the session did not touch
   * @throws {SessionChangeStaleError} the disk is no longer the revision, or not what the session
   *   left, or the hunk is gone (S-139)
   * @throws whatever the trail threw — and then nothing on disk was touched
   */
  execute(command: RejectChangeCommand): Promise<RewindOutcome> {
    return this.locked(command, (live) => this.reject(live, command));
  }

  private async reject(live: LiveSession, command: RejectChangeCommand): Promise<RewindOutcome> {
    const change = await readChange(live, command.path, this.stores);

    // The same hunk sent again, already applied: it is written once (S-144).
    if (this.isRepeat(live, command, change)) {
      return outcomeOf(change.promptId, [], [{ path: command.path }], command.hunkId);
    }

    const result = rejected(change, command);

    await recordFilesRewound(
      this.writing,
      { live, userId: command.userId, promptId: change.promptId },
      { rejected: { path: command.path, hunkId: command.hunkId } },
    );

    // The last hunk of a file the session created leaves nothing: the file goes, as the undo would
    // do (S-141).
    const removes = change.before.state === 'absent' && result === '';
    const left = await putDown(live, command.path, removes ? null : encode(result), {
      ...this.stores,
      clock: this.writing.clock,
    });

    this.memory.rememberRejection(live.session, {
      path: command.path,
      promptId: change.promptId,
      hunkId: command.hunkId,
      revision: command.revision,
      replaced: change.now.state === 'content' ? encode(change.now.content) : null,
      left,
    });

    return outcomeOf(
      change.promptId,
      [{ path: command.path, action: removes ? 'deleted' : 'restored' }],
      [],
      command.hunkId,
    );
  }

  /** Whether this exact rejection was already applied, and the disk is still what it left. */
  private isRepeat(
    live: LiveSession,
    command: RejectChangeCommand,
    change: SessionChangeFile,
  ): boolean {
    const known = this.memory.rejectionOf(live.session, command.path);

    return (
      known?.hunkId === command.hunkId &&
      known.revision === command.revision &&
      (known.left ?? ABSENT_REVISION) === change.revision
    );
  }
}

/**
 * The text of the file with the hunk put back.
 *
 * @throws {SessionChangeStaleError} the disk is not what the session left, is not the revision the
 *   hunks were computed on, or no longer has the hunk (S-139)
 */
function rejected(change: SessionChangeFile, command: RejectChangeCommand): string {
  const result =
    change.modifiedOutside || change.revision !== command.revision
      ? null
      : withHunkReverted(sideText(change.before), sideText(change.now), command.hunkId);

  if (result === null) {
    throw new SessionChangeStaleError(command.path);
  }

  return result;
}

/**
 * Undoes the last rejection of a file — plan 08, B-31: "undo instead of confirm".
 *
 * Only while the file is still exactly what the rejection left (S-142); then it gets back, byte for
 * byte, what the rejection replaced, with the same locks, the trail first and the baseline moved.
 */
export class RestoreChangeUseCase extends ChangeWritingUseCase {
  /**
   * @throws {import('@domain/session').SessionLockedError} a turn or another undo is running
   * @throws {SessionChangeNotFoundError} no rejection of that file to undo
   * @throws {SessionChangeStaleError} the file changed since the rejection
   */
  execute(command: RestoreChangeCommand): Promise<RewindOutcome> {
    return this.locked(command, (live) => this.restore(live, command));
  }

  private async restore(live: LiveSession, command: RestoreChangeCommand): Promise<RewindOutcome> {
    const rejection = this.memory.rejectionOf(live.session, command.path);

    if (rejection === null) {
      throw new SessionChangeNotFoundError(command.path);
    }

    const now = await this.stores.disk.read(command.path, Number.MAX_SAFE_INTEGER);

    if (now.kind === 'unsafe') {
      throw new WorkspaceNotAllowedError(command.path);
    }

    if ((now.kind === 'file' ? now.hash : null) !== rejection.left) {
      throw new SessionChangeStaleError(command.path);
    }

    await recordFilesRewound(
      this.writing,
      { live, userId: command.userId, promptId: rejection.promptId },
      { restoredRejection: { path: command.path, hunkId: rejection.hunkId ?? null } },
    );

    await putDown(live, command.path, rejection.replaced, {
      ...this.stores,
      clock: this.writing.clock,
    });
    this.memory.forgetRejection(live.session, command.path);

    return outcomeOf(
      rejection.promptId,
      [{ path: command.path, action: rejection.replaced === null ? 'deleted' : 'restored' }],
      [],
      rejection.hunkId,
    );
  }
}

/** One file of the changes, whole — shared by the read and by the rejection, which checks it. */
async function readChange(
  live: LiveSession,
  path: string,
  stores: ChangeStores,
): Promise<SessionChangeFile> {
  const reach = reachOf(live);
  const first = firstCheckpoints(await stores.journal.checkpointsOf(reach)).get(path);

  if (first === undefined) {
    throw new SessionChangeNotFoundError(path);
  }

  const content = await stores.disk.read(path, stores.limits.maxFileBytes);

  if (content.kind === 'unsafe') {
    throw new WorkspaceNotAllowedError(path);
  }

  const baseline = latestBaselines(await stores.journal.baselinesOf(reach)).get(path) ?? null;
  const observation = observationOf(content);
  const before = await sideOf(first, stores.disk);
  const now = nowSideOf(path, content);

  return {
    path,
    kind: fileChangeOf(first, baseline, observation)?.kind ?? null,
    promptId: first.promptId,
    modifiedOutside: !isAsLeft(baseline, observation),
    before,
    now,
    revision: content.kind === 'file' ? content.hash : ABSENT_REVISION,
    hunks: hunksOf(before, now),
  };
}

/** The hunks between two sides — none when either is not text that was read. */
function hunksOf(before: ChangeSide, now: ChangeSide): DiffHunk[] {
  return before.state === 'notRestorable' || now.state === 'notRestorable'
    ? []
    : hunksBetween(sideText(before), sideText(now));
}

/**
 * Writes `content` over a path — or removes it, for `null` — and records it as how the session left
 * the file.
 *
 * @returns the hash of what was left, or `null` when nothing was
 */
async function putDown(
  live: LiveSession,
  path: string,
  content: Uint8Array | null,
  stores: ChangeStores & { readonly clock: Clock },
): Promise<string | null> {
  let left: { hash: string | null; mtime: Date; sizeBytes: number };

  if (content === null) {
    await stores.disk.remove(path);
    left = { hash: null, mtime: stores.clock.now(), sizeBytes: 0 };
  } else {
    left = await stores.disk.write(path, content);
  }

  await stores.journal.recordBaseline(
    SessionFileState.record({
      sessionId: live.session.id,
      claudeSessionId: live.conversation.claudeSessionId,
      path,
      ...left,
      updatedAt: stores.clock.now(),
    }),
  );

  return left.hash;
}

/** The side of a file before the session, from the snapshot of the first turn that touched it. */
async function sideOf(checkpoint: TurnFileCheckpoint, disk: UndoDisk): Promise<ChangeSide> {
  if (checkpoint.existedBefore === 'absent') {
    return { state: 'absent' };
  }

  if (!checkpoint.canBeRestored) {
    return {
      state: 'notRestorable',
      reason: checkpoint.restorable === 'tooLarge' ? 'tooLarge' : 'unreadable',
    };
  }

  try {
    return {
      state: 'content',
      content: textOf(checkpoint.path, await disk.snapshotOf(checkpoint)),
    };
  } catch (error) {
    if (error instanceof FileNotTextError) {
      throw error;
    }

    // A blob that went missing or no longer matches its hash is a snapshot nobody can promise.
    return { state: 'notRestorable', reason: 'unreadable' };
  }
}

/** The side of a file now. A path that is not a regular file was refused before this. */
function nowSideOf(path: string, content: FileContent): ChangeSide {
  if (content.kind === 'file') {
    return { state: 'content', content: textOf(path, content.bytes) };
  }

  return content.kind === 'absent'
    ? { state: 'absent' }
    : { state: 'notRestorable', reason: 'tooLarge' };
}

/** The text of a side — an absent file is the empty text. */
function sideText(side: ChangeSide): string {
  return side.state === 'content' ? side.content : '';
}

/**
 * Bytes as text, or the refusal the files module gives a file that is not.
 *
 * UTF-8 only, the byte-order mark kept as a character: a rejection writes the text back, and an
 * encoding guessed on the way in is a file rewritten in another one on the way out.
 */
function textOf(path: string, bytes: Uint8Array): string {
  if (looksBinary(bytes)) {
    throw new FileNotTextError(path, 'binary');
  }

  if (!isUtf8(bytes)) {
    throw new FileNotTextError(path, 'encoding');
  }

  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** What the disk read says, as the rules of the undo look at a path. */
function observationOf(content: FileContent): FileObservation {
  switch (content.kind) {
    case 'file':
      return { kind: 'file', hash: content.hash };
    case 'absent':
      return { kind: 'absent' };
    default:
      return { kind: 'unsafe' };
  }
}

/** The earliest turn among the first touches — the point before the whole session. */
function firstPromptOf(first: readonly TurnFileCheckpoint[]): string | null {
  const [earliest] = [...first].sort(
    (left, right) =>
      left.capturedAt.getTime() - right.capturedAt.getTime() ||
      left.promptId.localeCompare(right.promptId),
  );

  return earliest?.promptId ?? null;
}

function outcomeOf(
  promptId: string,
  reverted: RewindOutcome['reverted'],
  unchanged: RewindOutcome['unchanged'],
  hunkId: string | undefined,
): RewindOutcome {
  return {
    promptId,
    reverted,
    preserved: [],
    unchanged,
    failed: [],
    ...(hunkId === undefined ? {} : { hunkId }),
  };
}
