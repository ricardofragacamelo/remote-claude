import type { SessionFileState } from '../entities/session-file-state.entity';

/**
 * What is at a path right now, as the undo is allowed to see it.
 *
 * `unsafe` is a path the undo will not write through: it became a symbolic link, a hard link or
 * something other than a regular file, or its directory no longer resolves to where it did. It was
 * the SDK's `skippedLinks`; writing the files ourselves, the check is ours, and without it a
 * restore is a way of writing outside the workspace
 * ([D-06](../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir)).
 */
export type FileObservation =
  | { readonly kind: 'file'; readonly hash: string }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unsafe' };

/**
 * Whether what is there now is what the session left — the one state the undo puts a file back
 * from, and a hunk is rejected in (plan 08, F3).
 *
 * No baseline is never "as left": nothing says the session was the last to touch the file.
 */
export function isAsLeft(baseline: SessionFileState | null, now: FileObservation): boolean {
  if (baseline === null) {
    return false;
  }

  if (baseline.hash === null) {
    return now.kind === 'absent';
  }

  return now.kind === 'file' && now.hash === baseline.hash;
}
