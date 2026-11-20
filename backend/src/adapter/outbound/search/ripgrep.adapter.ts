import { Inject, Injectable } from '@nestjs/common';
import process from 'node:process';

import type {
  EngineContextLine,
  EngineFileMatches,
  EngineLineMatch,
  ListFilesOutcome,
  ListFilesRun,
  ListLocateOutcome,
  ProcessBudget,
  RipgrepBinary,
  SearchEngine,
  SearchTextOutcome,
  SearchTextRun,
} from '@application/search';
import { PROCESS_RUNNER, ProcessAbortedError, RIPGREP_BINARY } from '@application/search';
import type { ProcessRunner } from '@application/search';
import {
  SearchEngineFailedError,
  allowedProcessEnv,
  locateArgv,
  searchTextArgv,
} from '@domain/search';
import type { LocateOptions, SearchTextOptions } from '@domain/search';
import { parseRipgrepLine } from './ripgrep-json.mapper';
import type { RipgrepMatchData, RipgrepMessage } from './ripgrep-json.mapper';

async function* linesOf(lines: AsyncIterable<Buffer>): AsyncIterable<string> {
  for await (const line of lines) {
    if (line.length > 0) {
      yield line.toString('utf8');
    }
  }
}

const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** Whether `line` decodes as UTF-8 without loss — `Buffer#toString('utf8')` never throws, it
 * silently replaces an invalid byte with U+FFFD, so this is the only way to actually tell (S-63). */
function isValidUtf8(line: Buffer): boolean {
  try {
    strictUtf8Decoder.decode(line);
    return true;
  } catch {
    return false;
  }
}

/**
 * A path `rg --files` returned, decoded as UTF-8 — one a filesystem allows but this backend (and
 * the wire format, and the client) cannot represent is omitted and counted, never garbled into a
 * string with a replacement character standing in for its real bytes (S-63).
 */
async function* pathsOf(
  lines: AsyncIterable<Buffer>,
  skipped: NonUtf8Counter,
): AsyncIterable<string> {
  for await (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    if (!isValidUtf8(line)) {
      skipped.nonUtf8 += 1;
      continue;
    }
    yield line.toString('utf8');
  }
}

/** Mutated while {@link pathsOf} runs, read only once {@link ProcessRunner}'s own outcome settles. */
interface NonUtf8Counter {
  nonUtf8: number;
}

/** {@link pathsOf}, plus [onDrained] once its own iteration truly ends — early abort included. */
async function* drainedPathsOf(
  lines: AsyncIterable<Buffer>,
  skipped: NonUtf8Counter,
  onDrained: () => void,
): AsyncIterable<string> {
  try {
    yield* pathsOf(lines, skipped);
  } finally {
    onDrained();
  }
}

/** Mutated while {@link groupedByFile} runs, read only once {@link ProcessRunner}'s own outcome settles. */
interface SkipCounter {
  binary: number;
}

/** A `drained` promise and the function that settles it — shared by both of this port's methods. */
function deferredDrain(): { readonly drained: Promise<void>; readonly onDrained: () => void } {
  let onDrained: () => void = () => {};
  const drained = new Promise<void>((resolve) => {
    onDrained = resolve;
  });
  return { drained, onDrained };
}

/** `RipgrepMatchData` reshaped to this port's own byte-offset vocabulary — never ripgrep's own. */
function engineLineMatchOf(data: RipgrepMatchData): EngineLineMatch {
  return {
    lineNumber: data.lineNumber,
    lineText: data.lineText,
    submatches: data.submatches.map((submatch) => ({
      startByte: submatch.start,
      endByte: submatch.end,
      text: submatch.text,
    })),
  };
}

/**
 * What an `end` message means for the file it closes: a binary file (S-67) is counted in
 * [skipped] instead, never yielded — binary content has no business reaching a text-search
 * result, even though ripgrep still searched and matched inside it (measured).
 */
function closedFileOf(
  message: Extract<RipgrepMessage, { type: 'end' }>,
  path: string,
  matchedLines: readonly EngineLineMatch[],
  contextLines: readonly EngineContextLine[],
  skipped: SkipCounter,
): EngineFileMatches | null {
  if (message.binaryOffset !== null) {
    skipped.binary += 1;
    return null;
  }
  return matchedLines.length > 0 ? { path, lines: matchedLines, contextLines } : null;
}

/**
 * Groups `rg --json`'s flat line stream back into one {@link EngineFileMatches} per file, yielded
 * the moment the engine's own `end` message closes that file — never once at the very end (D-02).
 * A line this backend does not recognise (`unknown`) is skipped, not a failure: ripgrep's own
 * `summary` falls in the same bucket, and carries nothing this port's callers need.
 */
async function* groupedByFile(
  lines: AsyncIterable<string>,
  skipped: SkipCounter,
  onDrained: () => void,
): AsyncIterable<EngineFileMatches> {
  let path: string | null = null;
  let matchedLines: EngineLineMatch[] = [];
  let contextLines: EngineContextLine[] = [];

  try {
    for await (const line of lines) {
      const message = parseRipgrepLine(line);

      if (message.type === 'begin') {
        path = message.path;
        matchedLines = [];
        contextLines = [];
      } else if (message.type === 'match' && path !== null) {
        matchedLines.push(engineLineMatchOf(message.data));
      } else if (message.type === 'context' && path !== null) {
        contextLines.push({ lineNumber: message.data.lineNumber, lineText: message.data.lineText });
      } else if (message.type === 'end' && path !== null) {
        const closed = closedFileOf(message, path, matchedLines, contextLines, skipped);
        if (closed !== null) {
          yield closed;
        }
        path = null;
      }
    }
  } finally {
    onDrained();
  }
}

/**
 * The ripgrep subprocess, behind the `SearchEngine` port — the only place that builds its argv
 * and reads its output. Every run goes through {@link ProcessRunner}, which owns the discipline of
 * ADR-016; this class owns knowing what ripgrep is and what its lines mean.
 */
@Injectable()
export class RipgrepAdapter implements SearchEngine {
  constructor(
    @Inject(PROCESS_RUNNER) private readonly runner: ProcessRunner,
    @Inject(RIPGREP_BINARY) private readonly binary: RipgrepBinary,
  ) {}

  listFiles(
    folder: string,
    options: LocateOptions,
    budget: ProcessBudget,
    signal: AbortSignal,
  ): ListFilesRun {
    const run = this.runner.run({
      binary: this.binary.path,
      args: locateArgv(options),
      cwd: folder,
      env: allowedProcessEnv(process.env),
      label: 'search.locate',
      timeoutMs: budget.timeoutMs,
      maxBytes: budget.maxBytes,
      signal,
    });

    const skipped: NonUtf8Counter = { nonUtf8: 0 };
    const { drained, onDrained } = deferredDrain();

    return {
      paths: drainedPathsOf(run.lines, skipped, onDrained),
      outcome: listLocateOutcomeOf(run.outcome, skipped, drained),
    };
  }

  searchText(
    folder: string,
    pattern: string,
    options: SearchTextOptions,
    budget: ProcessBudget,
    signal: AbortSignal,
  ): SearchTextRun {
    const run = this.runner.run({
      binary: this.binary.path,
      args: searchTextArgv(pattern, options),
      cwd: folder,
      env: allowedProcessEnv(process.env),
      label: 'search.text',
      timeoutMs: budget.timeoutMs,
      maxBytes: budget.maxBytes,
      signal,
    });

    const skipped: SkipCounter = { binary: 0 };
    const { drained, onDrained } = deferredDrain();

    return {
      files: groupedByFile(linesOf(run.lines), skipped, onDrained),
      outcome: searchTextOutcomeOf(run.outcome, skipped, drained),
    };
  }
}

/** Shared by both port methods: abort passes through, any other failure becomes the domain's. */
function outcomeOf(
  outcome: ReturnType<ProcessRunner['run']>['outcome'],
): Promise<ListFilesOutcome> {
  return outcome.then(
    (result) => ({ truncated: result.truncated, timedOut: result.timedOut }),
    (error: unknown) => {
      if (error instanceof ProcessAbortedError) {
        throw error;
      }
      throw new SearchEngineFailedError(String(error));
    },
  );
}

/**
 * The same mapping as {@link outcomeOf}, plus [skipped] — read only once [drained] has resolved
 * too, which {@link groupedByFile} does only once its own iteration truly ends. The process can
 * close before a slow consumer has pulled every line out of the queue (measured); without
 * [drained], `skipped` would be read too early and under-count. A rejection (abort, real failure)
 * still short-circuits `Promise.all` immediately, never waiting on a consumer that stopped early.
 */
function searchTextOutcomeOf(
  outcome: ReturnType<ProcessRunner['run']>['outcome'],
  skipped: SkipCounter,
  drained: Promise<void>,
): Promise<SearchTextOutcome> {
  return Promise.all([outcomeOf(outcome), drained]).then(([result]) => ({
    ...result,
    skipped: skipped.binary,
  }));
}

/** The locate counterpart of {@link searchTextOutcomeOf} — [skipped] counts a non-UTF-8 path (S-63). */
function listLocateOutcomeOf(
  outcome: ReturnType<ProcessRunner['run']>['outcome'],
  skipped: NonUtf8Counter,
  drained: Promise<void>,
): Promise<ListLocateOutcome> {
  return Promise.all([outcomeOf(outcome), drained]).then(([result]) => ({
    ...result,
    skipped: skipped.nonUtf8,
  }));
}
