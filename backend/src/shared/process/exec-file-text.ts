import { execFile } from 'node:child_process';

/** What one `execFile`-as-text call needs. */
export interface ExecFileTextOptions {
  readonly cwd?: string;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly maxBuffer?: number;
}

/**
 * Runs [command] with [args] via `execFile` — never a shell string, so nothing in an argument is
 * ever interpreted by a shell — and answers its stdout as text, or rejects with whatever `execFile`
 * itself rejects with.
 *
 * The one subprocess convention this backend spawns a short-lived, read-only CLI with: an engine's
 * own `--version` (plan 13, B-11) and `git clone`/`rev-parse`/`ls-remote` (plan 13, B-47) are both
 * just this, with a different command, arguments and environment.
 */
export function execFileText(
  command: string,
  args: readonly string[],
  options: ExecFileTextOptions,
): Promise<string> {
  const spawnOptions = {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    timeout: options.timeoutMs,
    env: options.env,
    ...(options.maxBuffer === undefined ? {} : { maxBuffer: options.maxBuffer }),
  };

  return new Promise((resolve, reject) => {
    execFile(command, [...args], spawnOptions, (error, stdout) => {
      if (error === null) resolve(String(stdout));
      else reject(error);
    });
  });
}
