/** A subprocess to run, with the whole discipline of ADR-016 already decided by the caller. */
export interface ProcessCommand {
  /** Absolute path, resolved once at boot — never looked up on `PATH`. */
  readonly binary: string;
  /** Argv, one element per entry. Never joined into a single string. */
  readonly args: readonly string[];
  readonly cwd: string;
  /** The allow-listed environment the child receives. Never the process's own `env`. */
  readonly env: Readonly<Record<string, string>>;
  /** What the one completion log line calls this run — never the pattern or a path (S-12). */
  readonly label: string;
  /** Written to stdin and closed immediately after; omitted closes stdin with nothing written. */
  readonly stdin?: string;
  readonly timeoutMs: number;
  /** Bytes of stdout read before the child is killed and the run is marked truncated. */
  readonly maxBytes: number;
  /** Killing this run's child when the signal aborts — never left to the caller to notice. */
  readonly signal?: AbortSignal;
}

/** Why a run ended, for the one line the caller logs — never the command or its output. */
export interface ProcessOutcome {
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly bytesRead: number;
  /** The byte cap was hit and the child was killed before it finished on its own. */
  readonly truncated: boolean;
  readonly timedOut: boolean;
  readonly aborted: boolean;
}

/**
 * The run was killed because the caller's own `AbortSignal` fired — never a process failure.
 *
 * `outcome` **rejects** with this, rather than resolving with a flag, because an aborted request
 * has nobody left to hand a result to: the caller's job on catching it is to stop, not to
 * translate a failure for a response that will never be read (S-10).
 */
export class ProcessAbortedError extends Error {
  override readonly name = 'ProcessAbortedError';

  constructor() {
    super('the process was killed because its request was aborted');
  }
}

/** A command in progress: its stdout, line by line, and how it ended once it has. */
export interface ProcessRun {
  /**
   * stdout split on `\n`, each line a raw `Buffer` — never decoded, so a byte that is not valid
   * UTF-8 reaches the caller unchanged rather than becoming `U+FFFD` in silence (S-15). A line
   * split across two chunks of the underlying stream is never yielded until it is whole (S-16).
   */
  readonly lines: AsyncIterable<Buffer>;
  /**
   * Resolves once the child has exited, with `truncated`/`timedOut` as a result rather than a
   * failure — the lines gathered before either still answer the caller's question (S-70, S-71).
   * Rejects with {@link ProcessAbortedError} on abort, or with whatever `child_process` itself
   * raised (an `ENOENT` for a missing binary, S-11) for every other way a run never finishes.
   */
  readonly outcome: Promise<ProcessOutcome>;
}

/**
 * Runs a subprocess under the ADR-016 discipline: argv array, `shell: false`, a deadline with
 * `SIGTERM` then `SIGKILL`, a byte cap, and a child that dies the moment its request is aborted.
 *
 * Declared here because `search` is its first consumer; another module that needs a subprocess
 * declares its own port over the same adapter, rather than reaching into this one
 * (docs/architecture/backend/03-modules.md#search).
 */
export interface ProcessRunner {
  run(command: ProcessCommand): ProcessRun;
}

export const PROCESS_RUNNER = Symbol('ProcessRunner');
