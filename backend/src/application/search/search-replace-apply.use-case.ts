import { ReadFileUseCase, SaveFileUseCase } from '@application/files';
import type { OpenedFile } from '@application/files';
import type { UserId } from '@domain/auth';
import {
  FileChangedError,
  FileNotEncodableError,
  FileNotFoundError,
  FileNotTextError,
  FileTooLargeError,
  PreconditionRequiredError,
} from '@domain/files';
import {
  PathOutsideFolderError,
  SearchQuery,
  SearchReplaceApplyFailedError,
  SearchReplaceTooManyFilesError,
  appliedContentOf,
  containedRelativePath,
} from '@domain/search';
import type { AppliedLineMatch } from '@domain/search';
import { ProcessAbortedError } from './ports/process-runner.port';
import type { FolderResolver } from './ports/folder-resolver.port';
import type { ProcessBudget, SearchEngine } from './ports/search-engine.port';
import { searchTextOptionsOf } from './search-text-options';

/** One file an apply names, and the version the preview read it at. */
export interface SearchReplaceApplyFileRequest {
  readonly path: string;
  readonly etag: string;
}

export interface SearchReplaceApplyInput {
  readonly folder: string;
  readonly userId: UserId;
  readonly pattern: string;
  readonly isRegex: boolean;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly replacement: string;
  readonly preserveCase: boolean;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly useIgnoreFiles: boolean;
  readonly files: readonly SearchReplaceApplyFileRequest[];
}

export type SearchReplaceApplySkipReason = 'binary' | 'tooLarge' | 'sensitive';

export interface SearchReplaceApplyReport {
  readonly applied: readonly string[];
  readonly changed: readonly string[];
  readonly missing: readonly string[];
  readonly skipped: readonly {
    readonly path: string;
    readonly reason: SearchReplaceApplySkipReason;
  }[];
}

type FileOutcome =
  | { readonly kind: 'applied' }
  | { readonly kind: 'changed' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'skipped'; readonly reason: SearchReplaceApplySkipReason };

/** The report, while it is still being built up one file at a time. */
interface ApplyReportDraft {
  applied: string[];
  changed: string[];
  missing: string[];
  skipped: { path: string; reason: SearchReplaceApplySkipReason }[];
}

/**
 * Applying the replace (B-11, D-05): per file, as the undo of ADR-013 does it — what still
 * matches the version the preview showed is written, what does not is **preserved** and
 * reported, never silently skipped and never silently overwritten.
 *
 * Every file is re-read and re-matched against the **current** disk, never against what the
 * preview held — the request never resends match positions (B-03's own contract carries only
 * `path` and `etag`), and a position computed against stale content would be meaningless against
 * fresh content. The engine (never `RegExp`, D-04) finds the matches; `appliedContentOf` splices
 * them into the content this same read already decoded.
 */
export class SearchReplaceApplyUseCase {
  constructor(
    private readonly folders: FolderResolver,
    private readonly engine: SearchEngine,
    private readonly readFile: ReadFileUseCase,
    private readonly saveFile: SaveFileUseCase,
    private readonly maxFiles: number,
    private readonly maxFileBytes: number,
    private readonly multilineMaxFileBytes: number,
    private readonly budget: ProcessBudget,
  ) {}

  /**
   * @throws {SearchQueryInvalidError} the query is not well-formed
   * @throws {SearchPatternInvalidError} the pattern or the replacement needs a feature the
   *   engine, or this backend, cannot resolve on its own
   * @throws {SearchReplaceTooManyFilesError} more files than {@link maxFiles} were named
   * @throws {PreconditionRequiredError} some file in the request carries no `etag` at all —
   *   nothing is written (S-93)
   * @throws {PathOutsideFolderError} some file's path climbs out of the folder or is absolute —
   *   checked by shape alone, before any file is touched (S-91). A path that only turns out to
   *   escape through a symlink at read time is a different, later failure — this backend's own
   *   simplification is to let it surface as {@link SearchReplaceApplyFailedError} rather than a
   *   dedicated per-file outcome, since this backend never retries from this method
   * @throws {SearchReplaceApplyFailedError} a real write failed partway through the batch —
   *   `params.applied` says what was already written (S-89)
   */
  async execute(
    input: SearchReplaceApplyInput,
    signal?: AbortSignal,
  ): Promise<SearchReplaceApplyReport> {
    const query = SearchQuery.create({
      pattern: input.pattern,
      isRegex: input.isRegex,
      caseSensitive: input.caseSensitive,
      wholeWord: input.wholeWord,
      replacement: input.replacement,
      ...(input.include === undefined ? {} : { include: input.include }),
      ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
    });

    if (input.files.length > this.maxFiles) {
      throw new SearchReplaceTooManyFilesError(this.maxFiles);
    }
    for (const file of input.files) {
      if (file.etag.length === 0) {
        throw new PreconditionRequiredError(file.path, 'ifMatchMissing');
      }
      if (containedRelativePath(file.path) === null) {
        throw new PathOutsideFolderError(file.path);
      }
    }

    const folder = await this.folders.resolve(input.folder, input.userId);
    const report: ApplyReportDraft = { applied: [], changed: [], missing: [], skipped: [] };

    for (const target of input.files) {
      const outcome = await this.applyOne(
        folder.value,
        query,
        input,
        target,
        signal,
        report.applied,
      );
      recordOutcome(report, target.path, outcome);
    }

    return report;
  }

  private async applyOne(
    folderPath: string,
    query: SearchQuery,
    input: SearchReplaceApplyInput,
    target: SearchReplaceApplyFileRequest,
    signal: AbortSignal | undefined,
    appliedSoFar: readonly string[],
  ): Promise<FileOutcome> {
    try {
      const current = await this.openedOrOutcome(input, target.path);
      if ('outcome' in current) {
        return current.outcome;
      }
      if (current.file.etag.value !== target.etag) {
        return { kind: 'changed' };
      }
      return await this.writeReplaced(folderPath, query, input, target, current.file, signal);
    } catch (error) {
      if (error instanceof FileChangedError) {
        return { kind: 'changed' };
      }
      if (sensitiveFileRefused(error)) {
        return { kind: 'skipped', reason: 'sensitive' };
      }
      if (error instanceof ProcessAbortedError) {
        throw error;
      }
      throw new SearchReplaceApplyFailedError(appliedSoFar);
    }
  }

  private async writeReplaced(
    folderPath: string,
    query: SearchQuery,
    input: SearchReplaceApplyInput,
    target: SearchReplaceApplyFileRequest,
    file: OpenedFile,
    signal: AbortSignal | undefined,
  ): Promise<FileOutcome> {
    const matched = await this.freshMatchesOf(folderPath, query, input, target.path, signal);
    const newContent =
      matched === null
        ? file.content
        : appliedContentOf(file.content, matched, input.replacement, input.preserveCase);

    await this.saveFile.execute(
      {
        folder: input.folder,
        path: target.path,
        content: newContent,
        encoding: file.encoding,
        bom: file.bom,
        ifMatch: target.etag,
        confirmSensitive: false,
        via: 'replace',
      },
      input.userId,
    );
    return { kind: 'applied' };
  }

  private async openedOrOutcome(
    input: SearchReplaceApplyInput,
    path: string,
  ): Promise<{ readonly file: OpenedFile } | { readonly outcome: FileOutcome }> {
    try {
      const opened = await this.readFile.execute(
        { folder: input.folder, path, encoding: null, ifNoneMatch: null },
        input.userId,
      );
      return opened.kind === 'opened'
        ? { file: opened }
        : { outcome: { kind: 'skipped', reason: 'binary' } };
    } catch (error) {
      return { outcome: outcomeOfReadFailure(error) };
    }
  }

  /** `null` when the engine finds no match at all on this exact content — a no-op write. */
  private async freshMatchesOf(
    folderPath: string,
    query: SearchQuery,
    input: SearchReplaceApplyInput,
    path: string,
    signal: AbortSignal | undefined,
  ): Promise<readonly AppliedLineMatch[] | null> {
    const run = this.engine.searchText(
      folderPath,
      query.pattern,
      searchTextOptionsOf(query, {
        contextLines: 0,
        onlyPaths: [path],
        respectDefaultsAndIgnoreFiles: input.useIgnoreFiles,
        maxFileBytes: this.maxFileBytes,
        multilineMaxFileBytes: this.multilineMaxFileBytes,
      }),
      this.budget,
      signal ?? new AbortController().signal,
    );

    let matched: readonly AppliedLineMatch[] = [];
    for await (const file of run.files) {
      matched = file.lines;
    }
    await run.outcome;

    return matched.length === 0 ? null : matched;
  }
}

function outcomeOfReadFailure(error: unknown): FileOutcome {
  if (error instanceof FileNotFoundError) {
    return { kind: 'missing' };
  }
  if (error instanceof FileNotTextError || error instanceof FileNotEncodableError) {
    return { kind: 'skipped', reason: 'binary' };
  }
  if (error instanceof FileTooLargeError) {
    return { kind: 'skipped', reason: 'tooLarge' };
  }
  throw error;
}

function sensitiveFileRefused(error: unknown): boolean {
  return error instanceof PreconditionRequiredError && error.params['reason'] === 'sensitiveFile';
}

function recordOutcome(report: ApplyReportDraft, path: string, outcome: FileOutcome): void {
  switch (outcome.kind) {
    case 'applied':
      report.applied.push(path);
      break;
    case 'changed':
      report.changed.push(path);
      break;
    case 'missing':
      report.missing.push(path);
      break;
    case 'skipped':
      report.skipped.push({ path, reason: outcome.reason });
      break;
  }
}
