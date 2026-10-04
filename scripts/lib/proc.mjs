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
 *           stdio?: import('node:child_process').StdioOptions,
 *           foreground?: boolean }} [options] `stdio` defaults to
 *   `inherit`, so a dev server reports to the terminal it was started from; the suite pipes
 *   instead, because there the output is what is being asserted on. `foreground` keeps the child
 *   in this terminal's process group, for one that reads the keyboard — `flutter run` and its hot
 *   reload: a process outside the foreground group that reads the terminal is stopped by the
 *   kernel. It then gets the Ctrl+C too, and `kill` still reaches it, alone
 * @returns {ChildProcess}
 */
export function startProc(command, args, options = {}) {
  return spawn(command, [...args], {
    stdio: options.stdio ?? 'inherit',
    // Own process group on POSIX, so the whole tree can be signalled at once. On Windows there
    // is no process group to detach into, and `shell` is what makes `pnpm` resolvable.
    detached: !isWindows && options.foreground !== true,
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
 * How long, past the grace period, `kill` keeps looking for what is left of a group after the
 * SIGKILL. Nothing survives SIGKILL; this only bounds the wait for the kernel to say so.
 */
const SETTLE_MS = 2_000;

/** How often `kill` asks again whether anything of the group is left. */
const SWEEP_INTERVAL_MS = 50;

/**
 * Whether anything of the process group led by `pid` is still alive.
 *
 * **The leader exiting is not the tree exiting.** `pnpm` answers SIGTERM at once, while the dev
 * server under it is still closing its sockets — or ignoring the signal altogether — and a
 * teardown that stops at the leader leaves that server behind as an orphan holding the port.
 * Signal 0 asks whether the group exists without delivering anything.
 *
 * Any failure reads as "nothing left": ESRCH is exactly that, and EPERM is a group this user
 * cannot signal, so there is nothing `kill` could do about it either. Windows has no group to
 * ask about, and `taskkill /t` is already the whole tree there.
 *
 * @param {number} pid the group leader, as `startProc` started it
 * @returns {boolean}
 */
export function groupAlive(pid) {
  /* v8 ignore next 3 -- the Windows answer cannot run on a POSIX test host. */
  if (isWindows) {
    return false;
  }

  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a process exists — this user's or another's.
 *
 * `EPERM` is a process that is there and belongs to somebody else, which is alive for every purpose
 * of the caller: the one question it answers is whether a run that owns a stack is still going.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
}

/**
 * Sends a signal to what is left of a group whose leader has already exited.
 *
 * `sendSignal` refuses a finished process, and rightly — its fallback to the bare pid could hit
 * an unrelated process that has reused it. The group id is safe to signal while `groupAlive`
 * says so: the kernel does not hand out a pid that is still in use as a group id.
 *
 * @param {number} pid
 * @param {NodeJS.Signals} signalName
 * @returns {void}
 */
function signalSurvivors(pid, signalName) {
  if (!groupAlive(pid)) {
    return;
  }

  try {
    process.kill(-pid, signalName);
    /* v8 ignore next 4 -- needs the group to vanish between the check and the signal: a real
       race, and not one a test can produce on demand. */
  } catch {
    // Gone in between, which is the outcome we wanted.
  }
}

/**
 * Terminates a process **and everything in its group**: SIGTERM, then SIGKILL for whatever is
 * still alive after the grace period.
 *
 * It resolves when the group is empty, not when the leader exits — see `groupAlive`.
 *
 * @param {ChildProcess} proc
 * @param {{ graceMs?: number }} [options]
 * @returns {Promise<void>} resolves once nothing of the group is left
 */
export async function kill(proc, options = {}) {
  const pid = proc.pid;

  // Same pair of questions as in `sendSignal`: the second only narrows the type.
  if (isFinished(proc) || pid === undefined) {
    return;
  }

  const graceMs = options.graceMs ?? GRACE_MS;
  const deadline = Date.now() + graceMs + SETTLE_MS;
  const exited = new Promise((resolve) => {
    proc.once('exit', resolve);
  });

  const escalation = setTimeout(() => {
    // The leader may still be alive, or only the rest of its group: each call covers one case
    // and is a no-op in the other.
    sendSignal(proc, 'SIGKILL');
    signalSurvivors(pid, 'SIGKILL');
  }, graceMs);

  sendSignal(proc, 'SIGTERM');
  await exited;

  // The leader is gone; the rest of its group may not be. The escalation stays armed for them.
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SWEEP_INTERVAL_MS));
  }

  clearTimeout(escalation);
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

/**
 * Runs a script's `main` to its exit code, and its teardown whatever the way out — a code, or an
 * error nobody expected, which is told through [report] and exits 1.
 *
 * @param {() => Promise<number>} main
 * @param {() => Promise<void>} teardown
 * @param {(message: string) => void} report
 * @returns {Promise<number>} the exit code
 */
export async function runToExit(main, teardown, report) {
  try {
    const code = await main();
    await teardown();
    return code;
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    await teardown();
    return 1;
  }
}
