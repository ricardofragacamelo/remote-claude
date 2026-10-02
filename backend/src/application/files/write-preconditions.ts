import type { PathLock } from '@application/shared';
import {
  FileChangedError,
  PreconditionRequiredError,
  isWildcard,
  touchesSensitive,
} from '@domain/files';
import type { Etag, FilePath } from '@domain/files';

/**
 * The second step of a file that changes what Claude may do — or of a folder that holds one
 * ([07 · D-15](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).
 *
 * @returns whether the operation reaches one, for the trail to say so
 * @throws {PreconditionRequiredError} it does, and the request did not confirm it (S-79)
 */
export function confirmSensitive(confirmed: boolean, ...entries: readonly FilePath[]): boolean {
  const sensitive = entries.find((entry) => touchesSensitive(entry.relative));

  if (sensitive !== undefined && !confirmed) {
    throw new PreconditionRequiredError(sensitive.relative, 'sensitiveFile');
  }

  return sensitive !== undefined;
}

/**
 * An optional `If-Match` of a move or a delete: absent — or `*`, which names any version — checks
 * nothing; anything else has to name the version on disk, which a folder or a link never has.
 *
 * @throws {FileChangedError} it names another version (S-98)
 */
export function checkOptionalIfMatch(
  entry: FilePath,
  ifMatch: string | null,
  current: Etag | null,
): void {
  if (ifMatch === null || isWildcard(ifMatch)) {
    return;
  }

  if (current === null || !current.matchedBy(ifMatch)) {
    throw new FileChangedError(entry.relative, current?.value ?? null);
  }
}

/**
 * Runs `work` holding the lock of every path in `realPaths` — taken in one order, always, so two
 * operations over the same two paths can never each hold one and wait for the other.
 */
export async function underLocks<T>(
  lock: PathLock,
  realPaths: readonly string[],
  work: () => Promise<T>,
): Promise<T> {
  const [first, ...rest] = [...new Set(realPaths)].sort();

  if (first === undefined) {
    return work();
  }

  return lock.run(first, () => underLocks(lock, rest, work));
}
