/**
 * Running external commands from the scripts in `scripts/`.
 *
 * A missing executable is a normal outcome here, not a crash: `doctor` exists precisely to
 * report what is not installed. `run()` therefore never throws on ENOENT — it answers
 * `found: false`.
 *
 * There are three forms, and the difference between them is what happens to the caller's thread:
 * `run` blocks and captures, `runAttached` blocks and hands the terminal over, and `runAsync`
 * captures without blocking anything.
 */

import { spawn, spawnSync } from 'node:child_process';

/**
 * @typedef {object} RunResult
 * @property {boolean} found whether the executable was found on PATH
 * @property {number} code exit code; non-zero when the command failed or was not found
 * @property {string} stdout empty when the command ran attached to the terminal
 * @property {string} stderr
 */

/**
 * @typedef {object} RunOptions
 * @property {string} [cwd]
 * @property {number} [timeoutMs]
 * @property {NodeJS.ProcessEnv} [env]
 */

/**
 * Where a child runs, as spawn options — present only when the caller actually chose them.
 *
 * `{ cwd: undefined }` is not the same as leaving `cwd` out: `exactOptionalPropertyTypes` refuses
 * the first, and node would read it as "no working directory" rather than "inherit mine". Every
 * spawn in `scripts/` needs the same two lines, which is exactly one place too many for them to
 * live in each.
 *
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} options
 * @returns {{ cwd?: string, env?: NodeJS.ProcessEnv }}
 */
export function spawnLocation(options) {
  return {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
  };
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} options
 * @param {{ attached: boolean, defaultTimeoutMs: number }} mode
 * @returns {RunResult}
 */
function invoke(command, args, options, mode) {
  /** @type {import('node:child_process').SpawnSyncOptions} */
  const spawnOptions = {
    timeout: options.timeoutMs ?? mode.defaultTimeoutMs,
    ...(mode.attached ? { stdio: 'inherit' } : { encoding: 'utf8' }),
    ...spawnLocation(options),
  };

  const result = spawnSync(command, [...args], spawnOptions);
  const error = /** @type {(NodeJS.ErrnoException | undefined)} */ (result.error);

  if (error?.code === 'ENOENT') {
    return { found: false, code: 127, stdout: '', stderr: error.message };
  }

  return {
    found: true,
    code: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? (error === undefined ? '' : error.message)),
  };
}

/**
 * Runs a command and captures its output.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 * @returns {RunResult}
 */
export function run(command, args, options = {}) {
  return invoke(command, args, options, { attached: false, defaultTimeoutMs: 30_000 });
}

/**
 * Runs a command with the terminal attached, so its own output reaches the user unchanged.
 * Used for tools that already report well on their own — `gitleaks`, for instance.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 * @returns {RunResult}
 */
export function runAttached(command, args, options = {}) {
  return invoke(command, args, options, { attached: true, defaultTimeoutMs: 300_000 });
}

/**
 * Whether an executable is reachable on PATH.
 *
 * @param {string} command
 * @param {readonly string[]} [probeArgs] arguments of a harmless probe call
 * @returns {boolean}
 */
export function commandExists(command, probeArgs = ['--version']) {
  return run(command, probeArgs, { timeoutMs: 15_000 }).found;
}

/**
 * Runs a command **without blocking the event loop**, and captures its output.
 *
 * The reason this exists next to `run`: `spawnSync` holds the thread for the whole run, and a
 * caller that has to answer something meanwhile — a test worker reporting to vitest, a script
 * draining another pipe — stops answering it. Half a minute of that reads as a hang, and the
 * failure it produces names the reporter rather than the command.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 * @returns {Promise<RunResult>}
 */
export function runAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnLocation(options),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.timeoutMs ?? 300_000);

    child.once('error', (error) => {
      clearTimeout(deadline);

      // A command that is not on PATH is `found: false`, like the synchronous form. Anything else
      // did exist and could not be started — a file without the execute bit, typically.
      const missing = /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT';
      resolve({ found: !missing, code: 127, stdout, stderr: error.message });
    });

    child.once('close', (code, signal) => {
      clearTimeout(deadline);
      // Killed by a signal is not success, and `code` is null there: 128 + signal is the shell's
      // convention, and any non-zero would do — what matters is that it never reads as 0.
      resolve({ found: true, code: code ?? (signal === null ? 1 : 128), stdout, stderr });
    });
  });
}
