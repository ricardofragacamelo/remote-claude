import { AuditEntry, AuditUnavailableError } from '@domain/audit';
import type { AuditEntryDraft } from '@domain/audit';
import type { SessionId } from '@domain/session';
import type { IdGenerator } from '@domain/shared';
import type { AuditRepository } from './ports/audit.repository';

/**
 * What recording one invocation needs to know.
 *
 * Everything an entry carries except its id, which this use case mints — the caller describes the
 * invocation and never chooses its identity.
 */
export type RecordToolInvocationCommand = Omit<AuditEntryDraft, 'id'>;

/** What the caller must do about a session whose trail keeps failing. */
export type AuditOutcome = 'recorded' | 'refuseTool' | 'closeSession';

/**
 * Writes one invocation to the trail, and decides what a failure costs.
 *
 * **Without a trail, nothing is authorised.** A system that runs `Bash` on somebody's machine and
 * cannot say afterwards what it ran has already failed at the one thing it promised, so a write
 * that fails refuses the tool — always, with no exception and no degraded mode.
 *
 * Whether it also ends the session is the second question, and the answer is graded
 * ([D-07](../../../../docs/plans/01-live-session/decisions.md)):
 *
 * - the **first** failure denies the tool, is logged as an error and surfaces in the UI, with the
 *   session alive. A blip of network or a container restarting must not cost anybody their work;
 * - the **second consecutive** failure ends the session, with an explicit reason;
 * - a write that succeeds resets the count.
 *
 * It avoids both extremes the decision names: the zombie session, where nothing passes and the
 * person keeps trying, and death by hiccup.
 */
export class RecordToolInvocationUseCase {
  /** Consecutive failures **per session**: one session's bad luck is not another's. */
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly entries: AuditRepository,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * @returns what the caller should do — the tool passes only on `recorded`
   * @throws never: the decision is the return value, because a hook that throws would tell the
   *   SDK something different from what the session needs to do about it
   */
  async execute(command: RecordToolInvocationCommand): Promise<AuditOutcome> {
    const session = command.sessionId.value;

    try {
      await this.entries.append(AuditEntry.record({ ...command, id: this.ids.next() }));
    } catch (cause) {
      const consecutive = (this.failures.get(session) ?? 0) + 1;
      this.failures.set(session, consecutive);

      this.lastFailure = new AuditUnavailableError(consecutive, cause);

      return consecutive >= 2 ? 'closeSession' : 'refuseTool';
    }

    // A write that got through clears the debt: two failures with a success between them are two
    // hiccups, not a trail that has stopped working.
    this.failures.delete(session);
    this.lastFailure = null;

    return 'recorded';
  }

  /** The failure behind the last non-`recorded` outcome, for the caller to log and to surface. */
  lastFailure: AuditUnavailableError | null = null;

  /** How many writes have failed in a row for a session. Zero once one succeeds. */
  consecutiveFailures(sessionId: SessionId): number {
    return this.failures.get(sessionId.value) ?? 0;
  }
}
