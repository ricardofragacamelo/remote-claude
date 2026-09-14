/**
 * Long-lived child processes, and taking them down without leaving orphans.
 *
 * A dev server spawns children of its own (esbuild, tsc, the Vite worker). Signalling only the
 * process we started leaves those alive, holding the port, and the next `pnpm dev` fails with an
 * error that looks nothing like its cause. So on POSIX the child gets its **own process group**
 * (`detached`) and the signal goes to the group; on Windows the equivalent is `taskkill /t`.
 */

import { spawn } from 'node:child_process';

/** How long a process gets to honour SIGTERM before it is killed outright. */
export const GRACE_MS = 5_000;

const isWindows = process.platform === 'win32';

/**
 * @typedef {import('node:child_process').ChildProcess} ChildProcess
 */

/**
 * Starts a long-lived process with its output attached to this terminal.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv,
 *           stdio?: import('node:child_process').StdioOptions }} [options] `stdio` defaults to
 *   `inherit`, so a dev server reports to the terminal it was started from; the suite pipes
 *   instead, because there the output is what is being asserted on
 * @returns {ChildProcess}
 */
export function startProc(command, args, options = {}) {
  return spawn(command, [...args], {
    stdio: options.stdio ?? 'inherit',
    // Own process group on POSIX, so the whole tree can be signalled at once. On Windows there
    // is no process group to detach into, and `shell` is what makes `pnpm` resolvable.
    detached: !isWindows,
    shell: isWindows,
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
  });
}

/**
 * The command that takes down a process tree on Windows.
 *
 * @param {number} pid
 * @returns {{ command: string, args: string[] }}
 */
export function taskkillArgv(pid) {
  return { command: 'taskkill', args: ['/pid', String(pid), '/t', '/f'] };
}

/**
 * Signals a process — the whole group on POSIX, the whole tree on Windows.
 *
 * @param {ChildProcess} proc
 * @param {NodeJS.Signals} signalName
 * @returns {void}
 */
function sendSignal(proc, signalName) {
  const pid = proc.pid;
  if (pid === undefined || proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  try {
    if (isWindows) {
      const { command, args } = taskkillArgv(pid);
      spawn(command, args, { stdio: 'ignore', shell: true });
      return;
    }

    // Negative pid addresses the group created by `detached` in startProc.
    process.kill(-pid, signalName);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') {
      return;
    }

    try {
      // No such group: the process was not started by `startProc`, so it never became a group
      // leader. Signalling it alone is then the whole tree, and is better than doing nothing.
      process.kill(pid, signalName);
    } catch {
      // Already gone, which is the outcome we wanted. Racing against its own exit is normal
      // here, and there is nothing to log: `kill` reports what actually happened.
    }
  }
}

/**
 * Terminates a process: SIGTERM, then SIGKILL if it is still alive after the grace period.
 *
 * @param {ChildProcess} proc
 * @param {{ graceMs?: number }} [options]
 * @returns {Promise<void>} resolves once the process has exited
 */
export function kill(proc, options = {}) {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const escalation = setTimeout(() => {
      sendSignal(proc, 'SIGKILL');
    }, options.graceMs ?? GRACE_MS);

    proc.once('exit', () => {
      clearTimeout(escalation);
      resolve();
    });

    sendSignal(proc, 'SIGTERM');
  });
}

/**
 * Wraps a cleanup routine so it runs exactly once, however many times it is called.
 *
 * Signal handlers are not exclusive: a second Ctrl+C arrives while the first teardown is still
 * running, and SIGINT plus the `exit` handler both fire on the same shutdown. Tearing the stack
 * down twice races the two runs against each other.
 *
 * @template {unknown[]} A
 * @param {(...args: A) => Promise<void> | void} cleanup
 * @returns {(...args: A) => Promise<void>}
 */
export function cleanupOnce(cleanup) {
  /** @type {Promise<void> | null} */
  let running = null;

  return (...args) => {
    running ??= Promise.resolve(cleanup(...args)).then(() => undefined);
    return running;
  };
}
