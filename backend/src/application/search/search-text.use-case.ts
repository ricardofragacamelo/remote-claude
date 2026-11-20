import type { UserId } from '@domain/auth';
import {
  SearchEngineFailedError,
  SearchQuery,
  matchPreviewOf,
  utf16ColumnOf,
} from '@domain/search';
import type { SearchQueryInput } from '@domain/search';
import { ProcessAbortedError } from './ports/process-runner.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type {
  EngineFileMatches,
  ProcessBudget,
  SearchEngine,
  SearchTextOutcome,
} from './ports/search-engine.port';
import type { SearchConcurrencyGate } from './search-concurrency-gate';
import { searchTextOptionsOf } from './search-text-options';

export interface SearchTextInput extends SearchQueryInput {
  readonly folder: string;
  readonly userId: UserId;
  readonly useIgnoreFiles: boolean;
  readonly contextLines?: number;
}

export interface SearchMatchResult {
  /** 1-based, like every line number this backend already shows. */
  readonly line: number;
  /** 1-based, in UTF-16 units — what the editor of plan 07 counts in (S-65). */
  readonly column: number;
  readonly endColumn: number;
  readonly preview: string;
  /** Where the match falls inside `preview`, in UTF-16 units. */
  readonly previewMatchStart: number;
  readonly previewMatchEnd: number;
}

export interface SearchContextLineResult {
  readonly line: number;
  readonly text: string;
}

export interface SearchFileResult {
  readonly path: string;
  readonly matches: readonly SearchMatchResult[];
  readonly contextLines: readonly SearchContextLineResult[];
}

export type SearchTruncation = { readonly reason: 'limit' | 'timeout' } | null;

export interface SearchTextResult {
  readonly files: AsyncIterable<SearchFileResult>;
  /**
   * Resolves once {@link files} is exhausted, truncated or not (never a failure by itself).
   * Rejects with {@link ProcessAbortedError} when [signal] of {@link SearchTextUseCase.execute}
   * aborted the run from outside — the caller's job then is to stop, not to report anything,
   * because whoever was listening already left (S-101). Rejects with
   * {@link SearchEngineFailedError} for a real engine failure.
   */
  readonly outcome: Promise<{ readonly truncated: SearchTruncation; readonly skipped: number }>;
}

/**
 * Text search, streamed one file at a time as the engine closes it (D-02) — never buffered whole,
 * which is what lets a 5 MB minified line stay a few hundred characters of preview (S-66) and a
 * search of a large folder show its first result before the engine is done with the rest.
 */
export class SearchTextUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly engine: SearchEngine,
    private readonly concurrency: SearchConcurrencyGate,
    private readonly maxMatches: number,
    private readonly previewContextChars: number,
    private readonly maxFileBytes: number,
    private readonly multilineMaxFileBytes: number,
    private readonly budget: ProcessBudget,
  ) {}

  /**
   * @param signal the HTTP request's own — killed the moment it aborts, with nothing written
   *   after (S-101)
   * @throws {SearchQueryInvalidError} the query is not well-formed, every field at once
   * @throws {SearchPatternInvalidError} a regex feature the engine never supports
   * @throws {GlobOutsideFolderError} an include or exclude glob reaches outside the folder
   * @throws {PathOutsideFolderError} an entry of `onlyPaths` reaches outside the folder
   * @throws {SearchRateLimitedError} `scope: 'search'` — the caller already has a search running (S-73)
   */
  async execute(input: SearchTextInput, signal?: AbortSignal): Promise<SearchTextResult> {
    const query = SearchQuery.create(input);
    const folder = await this.folders.resolve(input.folder, input.userId);
    const userId = input.userId.toString();

    this.concurrency.acquire(userId);

    const controller = new AbortController();
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    const run = this.engine.searchText(
      folder.value,
      query.pattern,
      searchTextOptionsOf(query, {
        contextLines: input.contextLines ?? 0,
        onlyPaths: query.onlyPaths,
        respectDefaultsAndIgnoreFiles: input.useIgnoreFiles,
        maxFileBytes: this.maxFileBytes,
        multilineMaxFileBytes: this.multilineMaxFileBytes,
      }),
      this.budget,
      controller.signal,
    );

    let matchCount = 0;
    let hitMatchCeiling = false;
    const maxMatches = this.maxMatches;
    const previewContextChars = this.previewContextChars;
    const concurrency = this.concurrency;

    const files = (async function* (): AsyncIterable<SearchFileResult> {
      try {
        for await (const file of run.files) {
          matchCount += file.lines.reduce((sum, line) => sum + line.submatches.length, 0);
          yield toSearchFileResult(file, previewContextChars);
          if (matchCount >= maxMatches) {
            hitMatchCeiling = true;
            controller.abort();
            break;
          }
        }
      } finally {
        concurrency.release(userId);
      }
    })();

    const outcome = run.outcome.then(
      (result) => ({ truncated: truncationOf(result, hitMatchCeiling), skipped: result.skipped }),
      (error: unknown) => {
        if (hitMatchCeiling && error instanceof ProcessAbortedError) {
          return { truncated: { reason: 'limit' as const }, skipped: 0 };
        }
        if (error instanceof ProcessAbortedError) {
          throw error;
        }
        throw error instanceof SearchEngineFailedError
          ? error
          : new SearchEngineFailedError(String(error));
      },
    );

    return { files, outcome };
  }
}

function toSearchFileResult(
  file: EngineFileMatches,
  previewContextChars: number,
): SearchFileResult {
  return {
    path: file.path,
    matches: file.lines.flatMap((line) => toMatchResults(line, previewContextChars)),
    contextLines: file.contextLines.map((context) => ({
      line: context.lineNumber,
      text: context.lineText,
    })),
  };
}

function toMatchResults(
  line: EngineFileMatches['lines'][number],
  previewContextChars: number,
): SearchMatchResult[] {
  const lineBytes = Buffer.from(line.lineText, 'utf8');

  return line.submatches.map((submatch) => {
    const startColumn = utf16ColumnOf(lineBytes, submatch.startByte);
    const endColumn = utf16ColumnOf(lineBytes, submatch.endByte);
    const preview = matchPreviewOf(line.lineText, startColumn, endColumn, previewContextChars);

    return {
      line: line.lineNumber,
      column: startColumn + 1,
      endColumn: endColumn + 1,
      preview: preview.text,
      previewMatchStart: preview.matchStart,
      previewMatchEnd: preview.matchEnd,
    };
  });
}

function truncationOf(outcome: SearchTextOutcome, hitMatchCeiling: boolean): SearchTruncation {
  if (outcome.timedOut) {
    return { reason: 'timeout' };
  }
  return hitMatchCeiling || outcome.truncated ? { reason: 'limit' } : null;
}
