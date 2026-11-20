import type { LocateOptions, SearchTextOptions } from '@domain/search';

/** How a listing ended — never a failure by itself; what was found before it still answers. */
export interface ListFilesOutcome {
  readonly truncated: boolean;
  readonly timedOut: boolean;
}

/**
 * How a locate listing ended — `skipped` counts a path ripgrep gave back that this backend could
 * not decode as UTF-8, omitted from {@link ListFilesRun.paths} rather than garbled (S-63).
 */
export interface ListLocateOutcome extends ListFilesOutcome {
  readonly skipped: number;
}

/** A listing in progress: its paths, relative to the folder, and how it ended once it has. */
export interface ListFilesRun {
  readonly paths: AsyncIterable<string>;
  /** Resolves once {@link paths} is exhausted. Rejects on abort or a real engine failure. */
  readonly outcome: Promise<ListLocateOutcome>;
}

/**
 * The deadline and byte ceiling of one engine run — the use case's to decide, from configuration
 * (D-06), never the adapter's to assume: a locate and a text search weigh different amounts, and
 * only the use case reads `AppConfig.search`.
 */
export interface ProcessBudget {
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

/** One submatch of a matched line — still a byte offset, as ripgrep gives it (S-65). */
export interface EngineSubmatch {
  readonly startByte: number;
  readonly endByte: number;
  readonly text: string;
}

/** One line that matched, with every submatch on it. */
export interface EngineLineMatch {
  readonly lineNumber: number;
  readonly lineText: string;
  readonly submatches: readonly EngineSubmatch[];
}

/** One line of context (`-A`/`-B`) around a match, carried for display, never matched itself. */
export interface EngineContextLine {
  readonly lineNumber: number;
  readonly lineText: string;
}

/** Every match of one file, in the order the engine closed it — never split across two files. */
export interface EngineFileMatches {
  readonly path: string;
  readonly lines: readonly EngineLineMatch[];
  readonly contextLines: readonly EngineContextLine[];
}

/**
 * How a text search ended — `skipped` only counts what the engine's own stream makes observable
 * (a binary file, S-67); a file the walk excluded for being over the byte ceiling leaves no trace
 * in `rg --json` at all (measured), so it is absent from the results without being counted.
 */
export interface SearchTextOutcome extends ListFilesOutcome {
  readonly skipped: number;
}

/** A search in progress: one item per file the engine closed, and how it ended once it has. */
export interface SearchTextRun {
  readonly files: AsyncIterable<EngineFileMatches>;
  /** Resolves once {@link files} is exhausted. Rejects on abort or a real engine failure. */
  readonly outcome: Promise<SearchTextOutcome>;
}

/**
 * The ripgrep engine, behind the one seam `search`'s use cases depend on — never `ProcessRunner`
 * directly, which knows nothing about argv, globs or ripgrep's own output shape.
 */
export interface SearchEngine {
  /**
   * `rg --files` on [folder] — every path it finds, in whatever order the engine emits them.
   *
   * @param signal killed the moment it aborts; the caller also uses it to stop the listing early
   *   once it has read enough (B-09's own ceiling), which is not a failure either
   */
  listFiles(
    folder: string,
    options: LocateOptions,
    budget: ProcessBudget,
    signal: AbortSignal,
  ): ListFilesRun;

  /**
   * `rg --json` on [folder] with [pattern] — one {@link EngineFileMatches} per file, as soon as
   * the engine closes it, never once at the very end (D-02).
   *
   * @param signal killed the moment it aborts; the caller also uses it to stop the search early
   *   once it has read enough matches (B-10's own ceiling), which is not a failure either
   */
  searchText(
    folder: string,
    pattern: string,
    options: SearchTextOptions,
    budget: ProcessBudget,
    signal: AbortSignal,
  ): SearchTextRun;
}

export const SEARCH_ENGINE = Symbol('SearchEngine');

/**
 * The ripgrep binary B-07 resolved and proved at boot — a plain value, so the adapter that runs
 * it depends on this port rather than reaching into `infrastructure/config/` for it, which the
 * Dependency Rule never lets an adapter do.
 */
export interface RipgrepBinary {
  readonly path: string;
  /** `"15.0.0"` — the one `--version` actually reported. */
  readonly version: string;
}

export const RIPGREP_BINARY = Symbol('RipgrepBinary');
