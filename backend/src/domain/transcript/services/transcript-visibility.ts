import type { UserId } from '@domain/auth';
import type { WorkspaceAllowlist } from '@domain/workspace';
import type { TranscriptOrigin, TranscriptSession } from '../entities/transcript-session.entity';

/** What decides whether a caller sees a conversation. */
export interface TranscriptAudience {
  readonly allowlist: WorkspaceAllowlist;
  readonly userId: UserId;

  /**
   * Who opened the session here, when this backend did; `undefined` when it did not.
   *
   * It comes from **our** database, because the SDK reports no provenance: `SDKSessionInfo` has no
   * field for it, and `includeProgrammatic: false` returned the same sessions as `true` when
   * measured ([D-01](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
   */
  readonly openedBy: UserId | undefined;
}

/**
 * Whether a caller sees a conversation, and with which origin — or `null` when they do not.
 *
 * The same fence that decides where Claude may **run** decides what may be **read**: the store
 * holds the conversation of every project on the machine, a client's included, and a failure in
 * the mobile channel must not expose one nobody released for it. Three refusals, in order:
 *
 * 1. **no working directory** — nothing proves the session belongs to an allowed root, so it is
 *    excluded, failing closed (S-54);
 * 2. **a working directory outside the caller's roots** — the filter is on the `cwd` the SDK
 *    reported, not on the directory we asked about: a worktree of an allowed repository is another
 *    path on disk (S-55);
 * 3. **a session another person opened here** — it is theirs, even under a root both may use
 *    (S-04).
 *
 * A session no one opened here is `external` and belongs to whoever may reach its directory:
 * the machine is its owner's, and the allowlist is how the owner said who else may use it.
 */
export function transcriptOriginFor(
  session: TranscriptSession,
  audience: TranscriptAudience,
): TranscriptOrigin | null {
  if (session.cwd === null || !audience.allowlist.admits(session.cwd, audience.userId)) {
    return null;
  }

  if (audience.openedBy === undefined) {
    return 'external';
  }

  return audience.openedBy.equals(audience.userId) ? 'ours' : null;
}
