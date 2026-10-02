#!/usr/bin/env node
/**
 * The development stack, on the fixed ports of docs/plans/00-bootstrap/README.md#portas.
 *
 *   compose up -d  →  wait for Postgres and the Keycloak realm  →  backend (watch)
 *                  →  web (watch)  →  wait for both to answer  →  print the URL board
 *
 * The board waits for the dev servers on purpose: printed the moment they spawn, their own boot
 * output scrolls it off the screen, and what is left looks like a stack still coming up.
 *
 * Ctrl+C tears it down in reverse: web, then backend, then `compose stop`.
 *
 * `stop`, not `down`: the development stack **keeps its volumes**. Losing the local database at
 * every Ctrl+C is daily friction, and the command that does reclaim disk is `pnpm clean`.
 *
 * Usage: `pnpm dev`, or `pnpm dev:public [--url <origin>]`
 *
 * `--public` puts the same stack behind a tunnel, on one HTTPS origin (docs/plans/20-dev-public):
 *
 *   tunnel  →  compose up -d (+ docker-compose.public.yml)  →  the public redirect on the realm
 *           →  backend and web with the public origin and issuer  →  the board, with the origin
 *
 * The tunnel comes first because it is the cheap failure. Ctrl+C takes it down last, right before
 * `compose stop`. Without `--public`, an `RC_PUBLIC_URL` left in `.env` is blanked (D-02).
 *
 * The `dev` script `exec`s this file. Without it pnpm's `sh` sits in between, takes the Ctrl+C
 * itself, and dies of it while this file is still tearing down — pnpm then reports
 * `ELIFECYCLE Command failed` for a stop that went well.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { LOCAL_ALLOWLIST_FILE, activeAllowlist, withActiveAllowlist } from './lib/allowlist.mjs';
import { repoRoot } from './lib/paths.mjs';
import { resolveComposeCli } from './lib/compose.mjs';
import { run } from './lib/exec.mjs';
import { ensurePublicRedirect } from './lib/keycloak-admin.mjs';
import { bringUp, composeRunner, stillPending } from './lib/local-stack.mjs';
import { cleanupOnce, kill, onTermination, startProc } from './lib/proc.mjs';
import {
  ORIGIN_REFUSALS,
  PUBLIC_URL_VARIABLE,
  composeFiles,
  localEnvironment,
  parsePublicOrigin,
  parseStartArgs,
  publicEnvironment,
} from './lib/public-url.mjs';
import {
  HEALTH_PATH,
  boardRows,
  lanAddress,
  loadDotEnv,
  REALM,
  projectName,
  resolvePorts,
  serviceUrls,
  watchEnvironment,
  workspaceStatus,
} from './lib/stack.mjs';
import {
  TUNNEL_COMMAND,
  TUNNEL_TOKEN_FILE,
  TunnelError,
  readTunnelToken,
  startTunnel,
  tunnelEnvironment,
  tunnelMismatch,
} from './lib/tunnel.mjs';
import { bold, cyan, dim, fail, hint, info, line, ok, title, warn, yellow } from './lib/ui.mjs';
import { WaitError, waitForHttp } from './lib/wait.mjs';
import { ensureDeclaredRoots } from './lib/workspaces.mjs';

/** The workspaces started in watch mode, in start order. Torn down in reverse. */
const WATCHED = ['backend', 'web'];

/** How long a dev server gets to answer before the board is printed without it. */
const WATCH_READY_TIMEOUT_MS = 120_000;

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

/**
 * Holds the process in the foreground.
 *
 * `pnpm dev` is a foreground command: it stays until Ctrl+C, and Ctrl+C is what stops the stack.
 * Without this it would exit the moment `main` returns whenever there is no watch process to
 * keep the event loop alive — a workspace that does not exist yet, or one whose dev server dies —
 * leaving the containers up and no way to stop them but `docker`.
 *
 * @type {NodeJS.Timeout | null}
 */
let foreground = null;

/**
 * Whether this run brought compose up. A run that failed before it — a tunnel that did not open —
 * must not `compose stop` a stack someone else has up under the same project.
 */
let composeStarted = false;

// Before anything reads the environment: compose loads `.env` on its own, node does not, and
// the ports printed in the URL board have to be the ones compose actually published.
loadDotEnv(repoRoot);

const startArgs = parseStartArgs(process.argv.slice(2));
if (!startArgs.ok) {
  fail(startArgs.message);
  hint('usage: `pnpm dev`, or `pnpm dev:public [--url <origin>]`');
  process.exit(1);
}

/** Whether this run goes behind the tunnel. */
const publicMode = startArgs.public;

/** The origin to ask the tunnel for: `--url`, else `.env`, else the account's own domain. */
const requestedOrigin = startArgs.url ?? process.env[PUBLIC_URL_VARIABLE] ?? '';

// Blanked, not deleted, so neither the web config nor compose reads it back from `.env` (D-02).
// The public run sets it again once the tunnel says which origin it opened.
Object.assign(process.env, localEnvironment(process.env));

// The backend refuses to start when a root of the allowlist does not exist. Creating the
// development roots here is what keeps that rule from turning a fresh clone into a boot failure.
ensureDeclaredRoots();

const composeCli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));
const project = projectName(process.env);

/** One compose call against the development project — with the public override, in public mode. */
const compose = composeRunner(composeCli, project, {
  cwd: repoRoot,
  files: composeFiles(publicMode),
});

/**
 * Waits for each started workspace to answer, and says which ones did not.
 *
 * A dev server that does not answer is reported, never fatal: in watch mode a compile error is
 * something the developer fixes while the stack stays up.
 *
 * @param {ReturnType<typeof serviceUrls>} urls
 * @param {Map<string, import('node:child_process').ChildProcess>} running
 * @returns {Promise<Map<string, string>>} workspace → why it is not answering
 */
async function waitForWorkspaces(urls, running) {
  /** @type {Record<string, string>} */
  const probes = { backend: `${urls.backend}${HEALTH_PATH}`, web: urls.web };
  /** @type {Map<string, string>} */
  const problems = new Map();

  await Promise.all(
    [...running].map(async ([workspace, proc]) => {
      const url = probes[workspace];
      if (url === undefined) {
        return;
      }

      try {
        await waitForHttp(url, { proc, timeoutMs: WATCH_READY_TIMEOUT_MS, intervalMs: 1_000 });
        ok(workspace, url);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        warn(workspace, reason);
        problems.set(workspace, reason);
      }
    }),
  );

  return problems;
}

/**
 * Opens the tunnel and turns the environment public, before compose reads it.
 *
 * @param {number} webPort
 * @returns {Promise<string>} the public origin
 * @throws {Error} with the line to print when the origin is refused or the tunnel does not open
 */
async function openPublicOrigin(webPort) {
  /** @type {string | null} */
  let host = null;

  if (requestedOrigin.trim() !== '') {
    const parsed = parsePublicOrigin(requestedOrigin);
    if (!parsed.ok) {
      throw new TunnelError(
        `${PUBLIC_URL_VARIABLE}=${requestedOrigin} ${ORIGIN_REFUSALS[parsed.reason]}`,
      );
    }
    host = parsed.host;
  }

  info(
    `tunnel: ${TUNNEL_COMMAND} → localhost:${String(webPort)}${host === null ? '' : ` as ${host}`}`,
  );

  // The token goes to the tunnel's environment only; `process.env` — the backend's and the web's
  // — never holds it (D-05).
  const kept = readTunnelToken(path.join(repoRoot, TUNNEL_TOKEN_FILE));
  if (kept.exposed) {
    warn(`${TUNNEL_TOKEN_FILE} is readable by others`, `chmod 600 ${TUNNEL_TOKEN_FILE}`);
  }
  const tunnelEnv = tunnelEnvironment(process.env, kept.token);
  info(`tunnel authtoken: ${tunnelEnv.source === 'file' ? TUNNEL_TOKEN_FILE : tunnelEnv.source}`);

  const tunnel = await startTunnel({
    port: webPort,
    host,
    env: tunnelEnv.env,
    onError: (message) => {
      warn('tunnel', message);
    },
  });
  children.push(tunnel.proc);

  const mismatch = tunnelMismatch(tunnel.url, host);
  const opened = parsePublicOrigin(tunnel.url);
  if (mismatch !== null || !opened.ok) {
    throw new TunnelError(
      mismatch ?? `the tunnel opened ${tunnel.url}, which is not an https origin`,
    );
  }

  Object.assign(process.env, publicEnvironment(process.env, opened.origin));
  ok('tunnel', opened.origin);
  return opened.origin;
}

/**
 * Lets the realm's web client redirect back to the public origin.
 *
 * @param {string} origin
 * @param {string} keycloakUrl
 */
async function registerPublicRedirect(origin, keycloakUrl) {
  const result = await ensurePublicRedirect(
    {
      keycloakUrl,
      realm: REALM,
      clientId: process.env['OIDC_CLIENT_ID_WEB'] ?? 'remote-claude-web',
      username: process.env['RC_KEYCLOAK_ADMIN'] ?? 'admin',
      password: process.env['RC_KEYCLOAK_ADMIN_PASSWORD'] ?? 'admin',
    },
    origin,
  );
  ok('redirect', `${origin}/* ${result === 'added' ? 'added to' : 'already on'} the web client`);
}

/**
 * The public half of the board, and what reaching it means.
 *
 * @param {string} origin
 */
async function publicBoard(origin) {
  const issuer = process.env['OIDC_ISSUER'] ?? '';

  try {
    // The backend reads discovery through the tunnel too (R-02), so this is its path, tested.
    await waitForHttp(`${issuer}/.well-known/openid-configuration`, {
      timeoutMs: 15_000,
      intervalMs: 1_000,
      accept: (status) => status === 200,
    });
  } catch (error) {
    warn('issuer not answering through the tunnel', error instanceof Error ? error.message : '');
  }

  line();
  line(`  ${bold('Public')}  ${cyan(origin)}  ${dim('login, API and WebSocket on this origin')}`);
  line(dim(`          issuer ${issuer}`));
  line(
    yellow(
      '  Anyone with this address reaches the login of a backend that runs Bash on this machine.',
    ),
  );
  line(dim('  The development users have known passwords. Use this URL on this machine too.'));
}

/**
 * @param {import('./lib/stack.mjs').BoardRow[]} rows
 * @param {ReadonlySet<string>} running workspaces started in watch mode
 * @param {ReadonlyMap<string, string>} problems workspaces that never answered
 */
function board(rows, running, problems) {
  const nameWidth = Math.max(...rows.map((row) => row.name.length));
  const portWidth = Math.max(4, ...rows.map((row) => String(row.port).length));
  const labelWidth = Math.max(...rows.flatMap((row) => row.details.map(([label]) => label.length)));
  const indent = ' '.repeat(2 + nameWidth + 2 + portWidth + 2);

  line();
  line(dim(`  ${'Service'.padEnd(nameWidth)}  ${'Port'.padEnd(portWidth)}  Address`));

  for (const row of rows) {
    const head = `  ${bold(row.name.padEnd(nameWidth))}  ${String(row.port).padEnd(portWidth)}  `;

    if (row.workspace !== undefined && !running.has(row.workspace)) {
      line(`${head}${dim('not started')}`);
      continue;
    }

    const problem = row.workspace === undefined ? undefined : problems.get(row.workspace);
    line(
      `${head}${cyan(row.address)}${problem === undefined ? '' : `  ${yellow('not answering')}`}`,
    );

    for (const [label, value] of row.details) {
      line(`${indent}${dim(label.padEnd(labelWidth))}  ${cyan(value)}`);
    }
  }

  line();
  line(dim('Ctrl+C stops web → backend → compose stop. Volumes are preserved.'));
}

/**
 * Reverse of the start order, and idempotent: a second Ctrl+C arrives while the first teardown
 * is still running.
 */
const shutdown = cleanupOnce(async () => {
  line();
  info('stopping');

  if (foreground !== null) {
    clearInterval(foreground);
    foreground = null;
  }

  for (const child of [...children].reverse()) {
    await kill(child);
  }

  if (composeCli !== null && composeStarted) {
    // `stop`, not `down`: see the header of this file. In its own process group, so the second
    // Ctrl+C of an impatient hand does not interrupt it halfway and leave containers up.
    const stop = compose(['stop'], { ownProcessGroup: true });
    if (stop.code !== 0) {
      warn('compose stop did not exit cleanly', `exit ${String(stop.code)}`);
      hint('`docker ps` shows what is still up');
      return;
    }
  }

  ok(
    'stopped',
    composeStarted ? 'volumes preserved — `pnpm clean` is what reclaims them' : undefined,
  );
});

/** @returns {Promise<number | null>} exit code, or null to stay running */
async function main() {
  title(publicMode ? 'dev — public stack' : 'dev — local stack');

  const ports = resolvePorts(process.env);
  const urls = serviceUrls(ports);

  if (composeCli === null) {
    fail('docker compose is not available');
    hint('install the Compose v2 plugin (docker-compose-plugin) or the docker-compose binary');
    hint('`pnpm doctor` checks this, and everything else the stack needs');
    return 1;
  }

  const origin = publicMode ? await openPublicOrigin(ports.web) : null;

  info(`compose: ${`${composeCli.command} ${composeCli.args.join(' ')}`.trimEnd()}`);

  composeStarted = true;
  await bringUp(compose, urls);

  if (origin !== null) {
    await registerPublicRedirect(origin, urls.keycloak);
  }

  // The local copy `pnpm allowlist` writes, when there is one and `.env` left the variable at the
  // default (plan 06, D-09). Said out loud: "which allowlist is this?" is the first question.
  const where = { root: repoRoot, localExists: fs.existsSync(LOCAL_ALLOWLIST_FILE) };
  const allowlist = activeAllowlist(process.env, where);
  const environment = withActiveAllowlist(watchEnvironment(process.env), where);
  info(`allowlist: ${allowlist.file} (${allowlist.source})`);

  /** @type {Map<string, import('node:child_process').ChildProcess>} */
  const running = new Map();

  for (const workspace of WATCHED) {
    const status = workspaceStatus(repoRoot, workspace);

    if (!status.ready) {
      warn(`${workspace} — ${String(status.reason)}`, 'skipped');
      continue;
    }

    // `--silent` mutes pnpm's own reporter, not the dev server: without it every Ctrl+C ends in a
    // `Command failed with signal "SIGTERM"` per workspace, for a stop this script asked for.
    const proc = startProc('pnpm', ['--silent', '--filter', `./${workspace}`, 'dev'], {
      cwd: repoRoot,
      env: environment,
    });
    children.push(proc);
    running.set(workspace, proc);
    ok(workspace, 'watch');
  }

  const problems = await waitForWorkspaces(urls, running);
  const rows = boardRows(ports, { env: process.env, lan: lanAddress() });
  board(rows, new Set(running.keys()), problems);

  if (origin !== null) {
    await publicBoard(origin);
  }
  foreground = setInterval(() => {}, 60_000);
  return null;
}

// Ctrl+C is the documented way to stop `pnpm dev`, so stopping cleanly is a success.
onTermination(shutdown, 0);

try {
  const code = await main();

  if (code !== null) {
    await shutdown();
    process.exitCode = code;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));

  if (error instanceof TunnelError) {
    // Before compose: nothing of the stack was started, and the fix is on the tunnel's side.
    hint(
      `the authtoken goes in ${TUNNEL_TOKEN_FILE} (ignored by git), or in the tunnel's own config`,
    );
    hint(`${PUBLIC_URL_VARIABLE} empty uses the account's own domain; another run may hold it`);
  } else if (composeCli !== null) {
    // Whatever went wrong, the useful next step is the same: compose has already printed its own
    // diagnosis above, and what this adds is which service never made it.
    hint('the output above is compose’s own; `pnpm doctor` checks the environment around it');

    const pending = stillPending(compose);
    if (error instanceof WaitError && pending.length > 0) {
      hint(`still not up: ${pending.join(', ')} — \`${composeCli.command} logs\` says why`);
    }
  }

  await shutdown();
  process.exitCode = 1;
}
