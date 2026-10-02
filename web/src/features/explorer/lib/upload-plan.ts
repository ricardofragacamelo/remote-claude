import type {
  ConflictChoice,
  ExistingEntry,
  FileLimits,
  ManifestItem,
  UploadCandidate,
} from '../types/transfer';
import { ancestorsOf, childOf } from './paths';

/**
 * The plan of an upload, before anything is sent (B-52): whether it fits the ceilings, what each
 * conflict became, the manifest the server checks before the first byte, and how far each file went.
 * Pure: no request, no React.
 */

/** A transfer past a ceiling — what it measured, and the ceiling. */
export interface CeilingRefusal {
  /** A translation key, named in full here. */
  readonly messageKey: string;
  readonly measure: 'bytes' | 'entries';
  readonly limit: number;
  readonly actual: number;

  /** The file that is past it, for a ceiling of one file. */
  readonly path: string | null;
}

/**
 * Whether files fit the upload's ceilings — one file, how many, how much in all — told before a byte
 * is sent, with the ceiling (07 · D-16). The server checks the same before writing anything.
 */
export function uploadRefusal(
  candidates: readonly UploadCandidate[],
  limits: FileLimits | null,
): CeilingRefusal | null {
  if (limits === null) {
    return null;
  }

  const large = candidates.find((candidate) => candidate.file.size > limits.uploadMaxBytes);

  if (large !== undefined) {
    return {
      messageKey: 'explorer.transfer.fileTooLarge',
      measure: 'bytes',
      limit: limits.uploadMaxBytes,
      actual: large.file.size,
      path: large.path,
    };
  }

  if (candidates.length > limits.uploadMaxEntries) {
    return {
      messageKey: 'explorer.transfer.tooManyFiles',
      measure: 'entries',
      limit: limits.uploadMaxEntries,
      actual: candidates.length,
      path: null,
    };
  }

  const total = candidates.reduce((sum, candidate) => sum + candidate.file.size, 0);

  return total > limits.uploadMaxTotalBytes
    ? {
        messageKey: 'explorer.transfer.uploadTooLarge',
        measure: 'bytes',
        limit: limits.uploadMaxTotalBytes,
        actual: total,
        path: null,
      }
    : null;
}

/** A file whose path is taken, and what the person chose for it (S-319). */
export interface Conflict {
  readonly path: string;
  readonly existing: ExistingEntry;
  readonly choice: ConflictChoice;
}

/** The choices a conflict offers: a folder in the way cannot be replaced by a file. */
export function choicesOf(existing: ExistingEntry): readonly ConflictChoice[] {
  return existing.kind === 'file' ? ['replace', 'keepBoth', 'skip'] : ['keepBoth', 'skip'];
}

/** The conflicts of a preflight — each starting as "Skip": nothing is replaced unless chosen. */
export function conflictsOf(
  candidates: readonly UploadCandidate[],
  existing: ReadonlyMap<string, ExistingEntry>,
): readonly Conflict[] {
  return candidates.flatMap((candidate) => {
    const there = existing.get(candidate.path);
    return there === undefined ? [] : [{ path: candidate.path, existing: there, choice: 'skip' }];
  });
}

/** What an upload sends: the manifest, and its files in the same order. */
export interface UploadPlan {
  readonly manifest: readonly ManifestItem[];
  readonly files: readonly File[];
}

/** One item of the manifest, as its conflict was answered. */
function itemOf(candidate: UploadCandidate, conflict: Conflict | undefined): ManifestItem {
  const base = { path: candidate.path, size: candidate.file.size };

  if (conflict?.choice === 'replace' && conflict.existing.etag !== null) {
    return { ...base, onConflict: 'replace', ifMatch: conflict.existing.etag };
  }

  return { ...base, onConflict: conflict?.choice === 'keepBoth' ? 'keepBoth' : 'fail' };
}

/**
 * The manifest of an upload: a skipped file left out, a replaced one with the version it overwrites
 * (`ifMatch`), "keep both" as the server's new name — and a file with no conflict as `fail`, so a
 * path taken meanwhile is refused, never overwritten.
 */
export function planOf(
  candidates: readonly UploadCandidate[],
  conflicts: readonly Conflict[],
): UploadPlan {
  const byPath = new Map(conflicts.map((conflict) => [conflict.path, conflict]));
  const sent = candidates.filter((candidate) => byPath.get(candidate.path)?.choice !== 'skip');

  return {
    manifest: sent.map((candidate) => itemOf(candidate, byPath.get(candidate.path))),
    files: sent.map((candidate) => candidate.file),
  };
}

/** How far one file of an upload went, from `0` to `1`. */
export interface FileProgress {
  readonly path: string;
  readonly progress: number;
}

/**
 * How far each file went, out of the bytes of the whole request: the parts go in the order of the
 * manifest, so the bytes sent fill the files one after the other. What the form adds around them is
 * spread over them, in proportion.
 */
export function progressOf(
  items: readonly Pick<ManifestItem, 'path' | 'size'>[],
  loaded: number,
  total: number,
): FileProgress[] {
  const sum = items.reduce((all, item) => all + item.size, 0);
  const sent = total <= 0 ? 0 : (Math.min(loaded, total) / total) * sum;
  let before = 0;

  return items.map(({ path, size }) => {
    const start = before;
    before += size;

    if (size === 0) {
      return { path, progress: sent >= start && loaded > 0 ? 1 : 0 };
    }

    return { path, progress: Math.min(Math.max((sent - start) / size, 0), 1) };
  });
}

/** The levels of the tree an upload into `destination` touched — read again once it is done. */
export function levelsOf(destination: string, paths: readonly string[]): readonly string[] {
  const levels = new Set([destination]);

  for (const path of paths) {
    for (const folder of ancestorsOf(path)) {
      levels.add(childOf(destination, folder));
    }
  }

  return [...levels];
}
