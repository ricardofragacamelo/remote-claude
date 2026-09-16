/**
 * Long-lived child processes, and taking them down without leaving orphans.
 *
 * A dev server spawns children of its own (esbuild, tsc, the Vite worker). Signalling only the
 * process we started leaves those alive, holding the port, and the next `pnpm dev` fails with an
 * error that looks nothing like its cause. So on POSIX the child gets its **own process group**
 * (`detached`) and the signal goes to the group; on Windows the equivalent is `taskkill /t`.
 */

import { spawn } from 'node:child_process';

import { spawnLocation } from './exec.mjs';

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
    ...spawnLocation(options),
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
 * Whether there is still something to signal.
 *
 * A process with no pid never started, and one that has already exited or been signalled is
 * gone. Separated out so all three ways of being finished can be checked without racing a real
 * process into each of them.
 *
 * @param {Pick<ChildProcess, 'pid' | 'exitCode' | 'signalCode'>} proc
 * @returns {boolean}
 */
export function isFinished(proc) {
  return proc.pid === undefined || proc.exitCode !== null || proc.signalCode !== null;
}

/**
 * How a process tree is taken down on a platform.
 *
 * POSIX signals the **group** — the negative pid addresses the group `startProc` created with
 * `detached` — and Windows has no such thing, so it asks `taskkill` for the tree. The decision
 * is a pure function so both answers can be checked from either platform; hidden inside the
 * call, half of it would only ever run on somebody else's machine.
 *
 * @param {number} pid
 * @param {boolean} onWindows
 * @returns {{ kind: 'taskkill', command: string, args: string[] } | { kind: 'group', target: number }}
 */
export function signalPlan(pid, onWindows) {
  return onWindows ? { kind: 'taskkill', ...taskkillArgv(pid) } : { kind: 'group', target: -pid };
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

  // `isFinished` already covers the missing pid; this narrows the type for `signalPlan`, and is
  // the same question asked twice rather than a second rule.
  if (isFinished(proc) || pid === undefined) {
    return;
  }

  const plan = signalPlan(pid, isWindows);

  try {
    /* v8 ignore start -- the Windows call itself cannot run on a POSIX test host; the decision
       that chooses it is covered on both platforms, in signalPlan. */
    if (plan.kind === 'taskkill') {
      spawn(plan.command, plan.args, { stdio: 'ignore', shell: true });
      return;
    }
    /* v8 ignore stop */

    process.kill(plan.target, signalName);
  } catch (error) {
    /* v8 ignore next 3 -- reaching this needs process.kill to fail with something other than
       ESRCH, which on a POSIX host means EPERM against a process we own: not producible here. */
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') {
      return;
    }

    try {
      // No such group: the process was not started by `startProc`, so it never became a group
      // leader. Signalling it alone is then the whole tree, and is better than doing nothing.
      process.kill(pid, signalName);
      /* v8 ignore next 4 -- this catch needs the process to vanish between the two kill calls:
         a real race, and not one a test can produce on demand. */
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
  if (isFinished(proc)) {
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

/** The signals a foreground script has to tear down on. */
export const TERMINATION_SIGNALS = /** @type {NodeJS.Signals[]} */ ([
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
]);

/**
 * Runs `cleanup` on Ctrl+C, on `SIGTERM` and on a closed terminal, then exits with `code`.
 *
 * All three, not just `SIGINT`: a script killed by its parent — the suite that spawned it, a CI
 * runner reclaiming the job — has to take its containers down too, and only `SIGTERM` arrives
 * there. Pair it with `cleanupOnce`, because a second Ctrl+C lands while the first teardown is
 * still running.
 *
 * @param {() => Promise<void>} cleanup
 * @param {number} code exit code once the teardown has finished
 * @returns {void}
 */
export function onTermination(cleanup, code) {
  for (const signalName of TERMINATION_SIGNALS) {
    process.on(signalName, () => {
      void cleanup().then(() => {
        process.exit(code);
      });
    });
  }
}
