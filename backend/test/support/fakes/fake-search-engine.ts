import { ProcessAbortedError } from '@application/search';
import type {
  EngineFileMatches,
  ListFilesOutcome,
  ListFilesRun,
  ListLocateOutcome,
  ProcessBudget,
  SearchEngine,
  SearchTextRun,
} from '@application/search';
import type { LocateOptions, SearchTextOptions } from '@domain/search';

/** One call `FakeSearchEngine` recorded, for a test to assert against. */
export interface RecordedListFilesCall {
  readonly folder: string;
  readonly options: LocateOptions;
  readonly budget: ProcessBudget;
}

export interface RecordedSearchTextCall {
  readonly folder: string;
  readonly pattern: string;
  readonly options: SearchTextOptions;
  readonly budget: ProcessBudget;
}

function abortable<T>(
  signal: AbortSignal,
  naturalOutcome: T,
): { outcome: Promise<T>; onNaturalEnd: () => void } {
  let resolveOutcome: (value: T) => void = () => {};
  let rejectOutcome: (error: unknown) => void = () => {};
  const outcome = new Promise<T>((resolve, reject) => {
    resolveOutcome = resolve;
    rejectOutcome = reject;
  });
  signal.addEventListener('abort', () => rejectOutcome(new ProcessAbortedError()), {
    once: true,
  });

  return {
    outcome,
    onNaturalEnd: () => {
      if (!signal.aborted) resolveOutcome(naturalOutcome);
    },
  };
}

/**
 * A `SearchEngine` double a test can both script and read back from — the paths one `listFiles`
 * call answers, the file matches one `searchText` call answers, and every call either received,
 * for assertions on the folder, the options or the budget passed down from the use case.
 */
export class FakeSearchEngine implements SearchEngine {
  readonly listFilesCalls: RecordedListFilesCall[] = [];
  readonly searchTextCalls: RecordedSearchTextCall[] = [];

  constructor(
    private readonly paths: readonly string[] = [],
    private readonly fileMatches: readonly EngineFileMatches[] = [],
    private readonly naturalOutcome: ListFilesOutcome & { readonly skipped?: number } = {
      truncated: false,
      timedOut: false,
    },
  ) {}

  listFiles(
    folder: string,
    options: LocateOptions,
    budget: ProcessBudget,
    signal: AbortSignal,
  ): ListFilesRun {
    this.listFilesCalls.push({ folder, options, budget });
    const { paths, naturalOutcome } = this;
    const { outcome, onNaturalEnd } = abortable<ListLocateOutcome>(signal, {
      skipped: 0,
      ...naturalOutcome,
    });

    async function* generate(): AsyncIterable<string> {
      for (const path of paths) {
        if (signal.aborted) return;
        yield path;
      }
      onNaturalEnd();
    }

    return { paths: generate(), outcome };
  }

  searchText(
    folder: string,
    pattern: string,
    options: SearchTextOptions,
    budget: ProcessBudget,
    signal: AbortSignal,
  ): SearchTextRun {
    this.searchTextCalls.push({ folder, pattern, options, budget });
    const { fileMatches, naturalOutcome } = this;
    const { outcome, onNaturalEnd } = abortable(signal, {
      skipped: 0,
      ...naturalOutcome,
    });

    async function* generate(): AsyncIterable<EngineFileMatches> {
      for (const file of fileMatches) {
        if (signal.aborted) return;
        yield file;
      }
      onNaturalEnd();
    }

    return { files: generate(), outcome };
  }
}
