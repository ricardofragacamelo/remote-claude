/**
 * The tunnel `pnpm dev:public` publishes the web dev server through.
 *
 * The tunnel is infrastructure, not product (plan 19, D-04): only this development script knows
 * which one it is. It is started **before** compose, because it is the cheap failure — a domain
 * the account does not own, a missing authtoken, a second run holding the same domain — and
 * finding that out after two minutes of containers is the expensive way.
 *
 * The authtoken (docs/plans/20-dev-public/decisions.md, D-05) is kept in `.secrets/`, which git
 * ignores, and handed to the tunnel process alone as `NGROK_AUTHTOKEN` — never to the environment
 * of this script, which the backend and the web inherit, and never printed.
 */

import fs from 'node:fs';
import readline from 'node:readline';

import { startProc } from './proc.mjs';

/** The executable of the tunnel. */
export const TUNNEL_COMMAND = 'ngrok';

/** Where the authtoken is kept, relative to the repository root. Ignored by git (`/.secrets/`). */
export const TUNNEL_TOKEN_FILE = '.secrets/ngrok-authtoken';

/** The variable the tunnel reads its authtoken from. */
export const TUNNEL_TOKEN_VARIABLE = 'NGROK_AUTHTOKEN';

/**
 * @typedef {{ token: string | null, exposed: boolean }} TunnelToken `exposed` when group or others
 *   can read the file, which deserves a warning: it is a credential to the operator's account
 */

/**
 * Reads the kept authtoken: trimmed, or `null` when there is no file or nothing in it.
 *
 * @param {string} file absolute path
 * @returns {TunnelToken}
 */
export function readTunnelToken(file) {
  if (!fs.existsSync(file)) {
    return { token: null, exposed: false };
  }

  const token = fs.readFileSync(file, 'utf8').trim();
  // POSIX only: Windows reports no group or other bits worth reading.
  const exposed = process.platform !== 'win32' && (fs.statSync(file).mode & 0o077) !== 0;

  return { token: token === '' ? null : token, exposed };
}

/**
 * The environment of the tunnel process, and where its authtoken came from.
 *
 * An exported `NGROK_AUTHTOKEN` wins: it is the more deliberate of the two. Without either, the
 * tunnel falls back to its own configuration file.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string | null} token the kept one
 * @returns {{ env: NodeJS.ProcessEnv, source: 'environment' | 'file' | 'tunnel config' }}
 */
export function tunnelEnvironment(env, token) {
  const exported = env[TUNNEL_TOKEN_VARIABLE];

  if (exported !== undefined && exported.trim() !== '') {
    return { env: { ...env }, source: 'environment' };
  }

  if (token !== null) {
    return { env: { ...env, [TUNNEL_TOKEN_VARIABLE]: token }, source: 'file' };
  }

  return { env: { ...env }, source: 'tunnel config' };
}

/** How long the tunnel gets to report an endpoint before the run gives up. */
export const TUNNEL_TIMEOUT_MS = 30_000;

/**
 * The command line that publishes `port` on HTTPS.
 *
 * Without a host the tunnel uses the domain the account was given, and says which one in its log —
 * so a fresh setup needs no variable at all.
 *
 * @param {number} port local port of the web dev server
 * @param {string | null} host the public host to ask for, or null for the account's own
 * @returns {string[]}
 */
export function tunnelArgs(port, host) {
  return [
    'http',
    ...(host === null ? [] : [`--url=${host}`]),
    String(port),
    '--log=stdout',
    '--log-format=json',
  ];
}

/**
 * @typedef {{ kind: 'started', url: string } | { kind: 'error', message: string }} TunnelEvent
 */

/**
 * The one thing a line of the tunnel's JSON log says that this script acts on, if any.
 *
 * Errors carry the tunnel's own `ERR_NGROK_nnn`, which is what its documentation is indexed by.
 *
 * @param {string} line
 * @returns {TunnelEvent | null}
 */
export function parseTunnelLine(line) {
  /** @type {unknown} */
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof entry !== 'object' || entry === null) {
    return null;
  }

  const record = /** @type {Record<string, unknown>} */ (entry);

  if (record['msg'] === 'started tunnel' && typeof record['url'] === 'string') {
    return { kind: 'started', url: record['url'] };
  }

  if ((record['lvl'] === 'eror' || record['lvl'] === 'crit') && typeof record['err'] === 'string') {
    return { kind: 'error', message: summarizeError(record['err']) };
  }

  return null;
}

/**
 * The first line of a tunnel error, with its code when it has one.
 *
 * @param {string} error
 * @returns {string}
 */
function summarizeError(error) {
  const first = error.split(/\r?\n/)[0]?.trim() ?? '';
  const code = /ERR_NGROK_\d+/.exec(error)?.[0];

  return code === undefined || first.includes(code) ? first : `${first} (${code})`;
}

/**
 * Refuses an endpoint on a host other than the one asked for.
 *
 * The web build, the identity provider and the redirect are all configured for the requested
 * origin; serving them from another would fail at the login, far from its cause.
 *
 * @param {string} url what the tunnel reported
 * @param {string | null} host what was asked for, or null when any is fine
 * @returns {string | null} the reason to refuse, or null
 */
export function tunnelMismatch(url, host) {
  if (host === null) {
    return null;
  }

  const reported = new URL(url).host;
  return reported === host ? null : `the tunnel opened ${reported}, not ${host}`;
}

/** A tunnel that did not open. */
export class TunnelError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'TunnelError';
  }
}

/**
 * Starts the tunnel and resolves once it has an endpoint.
 *
 * The output is a pipe that has to be drained for as long as the tunnel lives — a full pipe stops
 * the process mid-write — so the reader stays attached after the start, and later errors (a
 * session that drops) are handed to `onError`.
 *
 * @param {{ port: number, host: string | null, command?: string, timeoutMs?: number,
 *           env?: NodeJS.ProcessEnv, onError?: (message: string) => void }} options
 * @returns {Promise<{ proc: import('node:child_process').ChildProcess, url: string }>}
 * @throws {TunnelError} when the tunnel is not installed, exits, reports an error first, or
 *   reports nothing in time
 */
export function startTunnel(options) {
  const command = options.command ?? TUNNEL_COMMAND;
  const timeoutMs = options.timeoutMs ?? TUNNEL_TIMEOUT_MS;
  const proc = startProc(command, tunnelArgs(options.port, options.host), {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(options.env === undefined ? {} : { env: options.env }),
  });

  return new Promise((resolve, reject) => {
    /** @type {string | null} */
    let lastError = null;
    let settled = false;

    /** @param {() => void} action */
    const settle = (action) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        action();
      }
    };

    const timer = setTimeout(() => {
      settle(() => {
        reject(new TunnelError(`the tunnel reported no endpoint within ${String(timeoutMs)}ms`));
      });
    }, timeoutMs);

    // Both are pipes (see the spawn above), so neither is null; the filter only says so to the types.
    for (const stream of [proc.stdout, proc.stderr].filter((pipe) => pipe !== null)) {
      readline.createInterface({ input: stream }).on('line', (line) => {
        const event = parseTunnelLine(line);

        if (event?.kind === 'started') {
          settle(() => {
            resolve({ proc, url: event.url });
          });
        } else if (event?.kind === 'error') {
          lastError = event.message;
          if (settled) {
            options.onError?.(event.message);
          }
        }
      });
    }

    proc.on('error', (error) => {
      const missing = /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT';
      settle(() => {
        reject(
          new TunnelError(
            missing ? `tunnel not found: \`${command}\` is not on PATH` : error.message,
          ),
        );
      });
    });

    // `close`, not `exit`: it comes after the pipes are drained, so the error line the tunnel
    // printed on its way out has been read by then.
    proc.on('close', (code, signal) => {
      settle(() => {
        const cause = signal ?? `code ${String(code)}`;
        reject(new TunnelError(`tunnel exited with ${cause}: ${lastError ?? 'no error reported'}`));
      });
    });
  });
}
