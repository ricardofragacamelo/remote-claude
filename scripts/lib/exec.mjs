/**
 * Running external commands from the scripts in `scripts/`.
 *
 * A missing executable is a normal outcome here, not a crash: `doctor` exists precisely to
 * report what is not installed. `run()` therefore never throws on ENOENT — it answers
 * `found: false`.
 */

import { spawnSync } from 'node:child_process';

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
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env }),
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
