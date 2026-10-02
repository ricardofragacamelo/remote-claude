import type { RecordAuditEventUseCase } from '@application/audit';
import type { AuditEventKind } from '@domain/audit';
import type { UserId } from '@domain/auth';
import { FileTrailUnavailableError } from '@domain/files';
import type { FilePath } from '@domain/files';
import type { Clock } from '@domain/shared';

/**
 * What a write of the trail could not record, reported rather than thrown.
 *
 * A callback rather than a logger, because `application/` has none and should not. It exists for
 * the one failure with nobody to return it to: the `file.failed` that would say the disk refused a
 * write — the disk's own error is what the request answers with.
 */
export type TrailFailureReporter = (error: unknown, firstEventId: string) => void;

/** A write of the person's, as the trail tells it. */
export interface FileFact {
  readonly userId: UserId;
  readonly kind: Exclude<AuditEventKind, 'file.failed'> & `file.${string}`;
  readonly target: FilePath;
  /** The real path — the subject; the relative one is the label. */
  readonly realPath: string;
  /** Sizes, hashes, origin and destination, counts, `sensitive`. Never the contents. */
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * The person's writes in the trail: **before** the disk, and corrected when the disk then refuses
 * ([07 · D-02](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).
 *
 * A trail that cannot take the fact is a write that does not happen: `503` with `Retry-After`, and
 * nothing on disk (S-117). A disk that fails after the fact was recorded leaves a `file.failed`
 * pointing at it (S-118) — without it, the trail would assert a write that never was.
 */
export class FileTrail {
  constructor(
    private readonly audit: RecordAuditEventUseCase,
    private readonly clock: Clock,
    private readonly reportFailure: TrailFailureReporter,
  ) {}

  /**
   * Records the fact, then does the write; on a failure of the write, records that too and lets the
   * failure through.
   *
   * @throws {FileTrailUnavailableError} the fact could not be recorded — and `write` never ran
   * @throws whatever `write` threw
   */
  async around<T>(fact: FileFact, write: () => Promise<T>): Promise<T> {
    const id = await this.record(fact);

    try {
      return await write();
    } catch (error) {
      await this.failed(fact, id, error);
      throw error;
    }
  }

  /**
   * Records a fact with nothing to run after it — a download, which writes nothing and still takes
   * contents off the machine: `file.downloaded` goes in **before the first byte** (07 · B-48).
   *
   * @returns the id of the fact
   * @throws {FileTrailUnavailableError} the fact could not be recorded — and nothing may be sent
   */
  async record(fact: FileFact): Promise<string> {
    try {
      return await this.audit.execute({
        userId: fact.userId,
        kind: fact.kind,
        subjectId: fact.realPath,
        subjectLabel: fact.target.relative,
        details: fact.details,
        at: this.clock.now(),
      });
    } catch (error) {
      throw new FileTrailUnavailableError(fact.target.relative, error);
    }
  }

  private async failed(fact: FileFact, firstEventId: string, error: unknown): Promise<void> {
    try {
      await this.audit.execute({
        userId: fact.userId,
        kind: 'file.failed',
        subjectId: fact.realPath,
        subjectLabel: fact.target.relative,
        details: { failedEventId: firstEventId, kind: fact.kind, code: codeOf(error) },
        at: this.clock.now(),
      });
    } catch (trailError) {
      this.reportFailure(trailError, firstEventId);
    }
  }
}

/** The code of a domain error, or what any other failure is — never its message. */
function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === 'string' ? code : 'INTERNAL_ERROR';
}
