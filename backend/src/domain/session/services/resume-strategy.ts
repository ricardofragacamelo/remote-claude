import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';

/**
 * How a conversation is continued.
 *
 * - `inPlace` — `resume` alone: one id, one transcript, and the undo history of the session kept.
 * - `fork` — `resume` with `forkSession: true`, under an id of ours: nothing is ever written into
 *   the file another consumer may be using.
 */
export type ResumeStrategy = 'inPlace' | 'fork';

/** What deciding needs to know about the conversation asked for. */
export interface ResumeCandidate {
  /** The working directory the SDK recorded, raw; `null` when it recorded none. */
  readonly cwd: string | null;

  /**
   * Who opened it here, when this backend did; `undefined` when it did not.
   *
   * From **our** database: the SDK reports no provenance at all
   * ([D-01](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
   */
  readonly openedBy: UserId | undefined;
}

/** Who is resuming, and in which workspace — already through the allowlist. */
export interface ResumeCaller {
  readonly userId: UserId;
  readonly workspace: WorkspacePath;
}

/**
 * Whether a caller may continue a conversation, and how — or `null` when, for them, it does not
 * exist.
 *
 * The origin decides, not a detection: there is no way to know that a conversation is open in the
 * editor right now, so a rule that depended on knowing would be a rule that cannot run
 * ([D-04](../../../../../docs/plans/04-transcript-and-resume/decisions.md)). That promotes the
 * origin from a label to an invariant of correctness — a wrong one means writing into the
 * transcript of another consumer, where two writers fork the chain of `parentUuid` and one side
 * vanishes from every later read.
 *
 * Three refusals, all answered as "not found":
 *
 * 1. **no working directory** — nothing proves the conversation belongs to an allowed root, so it
 *    fails closed, as the listing does (S-54);
 * 2. **another working directory** — the conversation is looked up inside the workspace it is
 *    resumed in. `resume` finds the file by `cwd`, so a session opened on a different path would
 *    either not be found by the SDK or run where the allowlist was not asked;
 * 3. **opened here by another person** — it is theirs, even under a root both may use. The same
 *    answer an absent id gets, so a refusal confirms nothing to somebody probing for ids.
 */
export function resumeStrategyFor(
  candidate: ResumeCandidate,
  caller: ResumeCaller,
): ResumeStrategy | null {
  if (candidate.cwd === null || candidate.cwd !== caller.workspace.value) {
    return null;
  }

  if (candidate.openedBy === undefined) {
    return 'fork';
  }

  return candidate.openedBy.equals(caller.userId) ? 'inPlace' : null;
}
