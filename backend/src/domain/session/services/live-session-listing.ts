import type { UserId } from '@domain/auth';
import type { WorkspacePath } from '@domain/workspace';
import type { Session } from '../entities/session.entity';

/**
 * The live sessions a person sees in a folder: theirs, running there or in a folder below it,
 * newest first.
 *
 * Two fences, both pure:
 *
 * - **the owner.** Somebody else's session in the same folder is not listed — not even as a count,
 *   because how many sessions another person runs is a fact about their work (plan 08, S-14);
 * - **containment, by path segment, on real paths.** The folder is the real path the allowlist
 *   resolved, and so is every session's workspace — `resolveFolder` hands the real one on — so a
 *   folder reached through a link and the folder itself list the same sessions once, and a link
 *   that escapes lists nothing. `/repo-old` is not inside `/repo`, and `/repo` is not inside
 *   `/repo/app`: a session of the parent folder belongs to the parent's tab (S-15, S-16, S-21).
 *
 * A closed session is not live, whatever the registry still holds of it.
 */
export function liveSessionsIn(
  folder: WorkspacePath,
  sessions: readonly Session[],
  userId: UserId,
): Session[] {
  return sessions
    .filter(
      (session) =>
        session.isOwnedBy(userId) && !session.isClosed && session.workspace.isWithin(folder),
    )
    .sort(newestFirst);
}

/** Opened later first; the id breaks a tie, so the order is the same on every call. */
function newestFirst(left: Session, right: Session): number {
  const byTime = right.openedAt.getTime() - left.openedAt.getTime();

  if (byTime !== 0) {
    return byTime;
  }

  return left.id.value < right.id.value ? -1 : 1;
}
