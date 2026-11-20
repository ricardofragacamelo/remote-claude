import type { UserId } from '@domain/auth';
import { LocateInputInvalidError, containedRelativePath, fuzzyScore } from '@domain/search';
import type { LocateInputViolation } from '@domain/search';
import { ProcessAbortedError } from './ports/process-runner.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { ListLocateOutcome, ProcessBudget, SearchEngine } from './ports/search-engine.port';
import type { LocateCache, LocateCacheEntry, LocateTruncation } from './locate-cache';

export type LocateEntryKind = 'file' | 'dir';

export interface LocateInput {
  readonly folder: string;
  readonly userId: UserId;
  readonly query: string;
  readonly kinds: readonly LocateEntryKind[];
  /** Recent and open paths of the caller's own tab — repeated, teto 50 (S-60). */
  readonly prefer: readonly string[];
  readonly limit?: number;
  readonly includeIgnored: boolean;
}

export interface LocateEntry {
  readonly path: string;
  readonly kind: LocateEntryKind;
  /** Ascending indices into `path`, for the client to highlight — empty for an unscored `prefer`. */
  readonly positions: readonly number[];
}

export interface LocateResult {
  readonly entries: readonly LocateEntry[];
  readonly truncated: LocateTruncation;
  /** Paths ripgrep returned that could not be decoded as UTF-8 — omitted, not garbled (S-63). */
  readonly skipped: number;
}

/** The most `prefer` entries a request may carry — S-60. */
export const MAX_PREFER_ITEMS = 50;

/**
 * Smaller than any gap {@link fuzzyScore} puts between a basename match and a directory-only one
 * (1,000,000): a `prefer`red path rises above an equally-good match, never above a clearly better
 * one that is not `prefer`red (S-40).
 */
export const PREFER_SCORE_BONUS = 500;

interface CandidateEntry {
  readonly path: string;
  readonly kind: LocateEntryKind;
}

/**
 * The locator behind the Quick Open and the `@` of the composer (plan 08): paths and directories
 * of an open folder, fuzzy-matched and ranked, served from a short-lived cache so a menu that
 * opens on every keystroke never waits for `rg --files` twice in a row for the same folder.
 */
export class FindPathsUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly engine: SearchEngine,
    private readonly cache: LocateCache,
    private readonly maxFiles: number,
    private readonly defaultResults: number,
    private readonly maxResults: number,
    private readonly budget: ProcessBudget,
  ) {}

  async execute(input: LocateInput, signal?: AbortSignal): Promise<LocateResult> {
    requireWellFormed(input, this.maxResults);
    const limit = input.limit ?? this.defaultResults;

    const folder = await this.folders.resolve(input.folder, input.userId);
    const cached = await this.cache.get(
      folder.value,
      (engineSignal) => this.listAll(folder.value, input.includeIgnored, engineSignal),
      signal,
    );

    const candidates = deriveEntries(cached.paths, input.kinds);
    const entries =
      input.query === ''
        ? onlyPreferred(candidates, input.prefer).slice(0, limit)
        : rankedByFuzzyScore(candidates, input.query, input.prefer).slice(0, limit);

    return { entries, truncated: cached.truncated, skipped: cached.skipped };
  }

  private async listAll(
    folder: string,
    includeIgnored: boolean,
    external: AbortSignal,
  ): Promise<LocateCacheEntry> {
    // Two distinct reasons to stop: this backend's own count ceiling (below), and the cache's own
    // waiter-tracked signal (S-62) — whichever fires first kills the one engine run underneath.
    const controller = new AbortController();
    const run = this.engine.listFiles(
      folder,
      { respectDefaultsAndIgnoreFiles: !includeIgnored },
      this.budget,
      AbortSignal.any([external, controller.signal]),
    );

    const paths: string[] = [];
    let hitCountCeiling = false;
    for await (const path of run.paths) {
      // Defence in depth (S-42): the engine never follows a symlink and never walks above the
      // folder it was given, so this should never fire — the rule does not depend on that
      // holding, the way `containedRelativePath` does not depend on where it is called from.
      const contained = containedRelativePath(path);
      if (contained === null) {
        continue;
      }
      paths.push(contained);
      if (paths.length >= this.maxFiles) {
        hitCountCeiling = true;
        controller.abort();
        break;
      }
    }

    const outcome = await settle(run.outcome, hitCountCeiling);
    return {
      paths,
      truncated: truncationOf(outcome, hitCountCeiling),
      skipped: outcome.skipped,
    };
  }
}

/** Our own early abort, once the count ceiling is hit, is not a failure — everything else is. */
async function settle(
  outcome: Promise<ListLocateOutcome>,
  hitCountCeiling: boolean,
): Promise<ListLocateOutcome> {
  try {
    return await outcome;
  } catch (error) {
    if (hitCountCeiling && error instanceof ProcessAbortedError) {
      return { truncated: false, timedOut: false, skipped: 0 };
    }
    throw error;
  }
}

function truncationOf(outcome: ListLocateOutcome, hitCountCeiling: boolean): LocateTruncation {
  if (outcome.timedOut) {
    return { reason: 'timeout' };
  }
  return hitCountCeiling || outcome.truncated ? { reason: 'limit' } : null;
}

function requireWellFormed(input: LocateInput, maxResults: number): void {
  const violations: LocateInputViolation[] = [];

  if (input.prefer.length > MAX_PREFER_ITEMS) {
    violations.push({ field: 'prefer', rule: 'tooManyPrefer' });
  }
  if (input.limit !== undefined && (input.limit < 1 || input.limit > maxResults)) {
    violations.push({ field: 'limit', rule: 'limitOutOfRange' });
  }

  if (violations.length > 0) {
    throw new LocateInputInvalidError(violations);
  }
}

function deriveEntries(
  paths: readonly string[],
  kinds: readonly LocateEntryKind[],
): readonly CandidateEntry[] {
  const entries: CandidateEntry[] = [];
  const directories = new Set<string>();
  const wantFiles = kinds.includes('file');
  const wantDirectories = kinds.includes('dir');

  for (const path of paths) {
    if (wantFiles) {
      entries.push({ path, kind: 'file' });
    }
    if (wantDirectories) {
      collectAncestorDirectories(path, directories);
    }
  }

  for (const directory of directories) {
    entries.push({ path: directory, kind: 'dir' });
  }
  return entries;
}

function collectAncestorDirectories(path: string, into: Set<string>): void {
  const segments = path.split('/');
  segments.pop();

  let prefix = '';
  for (const segment of segments) {
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    into.add(prefix);
  }
}

function onlyPreferred(
  candidates: readonly CandidateEntry[],
  prefer: readonly string[],
): LocateEntry[] {
  const preferSet = new Set(prefer);
  return candidates
    .filter((candidate) => preferSet.has(candidate.path))
    .map((candidate) => ({ ...candidate, positions: [] }));
}

function rankedByFuzzyScore(
  candidates: readonly CandidateEntry[],
  query: string,
  prefer: readonly string[],
): LocateEntry[] {
  const preferSet = new Set(prefer);

  return candidates
    .map((candidate) => {
      const match = fuzzyScore(candidate.path, query);
      if (match === null) {
        return null;
      }
      const bonus = preferSet.has(candidate.path) ? PREFER_SCORE_BONUS : 0;
      return { ...candidate, positions: match.positions, score: match.score + bonus };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .map(({ path, kind, positions }) => ({ path, kind, positions }));
}
