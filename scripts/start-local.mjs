#!/usr/bin/env node
/**
 * The development stack, on the fixed ports of docs/plans/00-bootstrap/README.md#portas.
 *
 *   compose up -d  →  wait for Postgres and the Keycloak realm  →  backend (watch)
 *                  →  web (watch)  →  print the URL board
 *
 * Ctrl+C tears it down in reverse: web, then backend, then `compose stop`.
 *
 * `stop`, not `down`: the development stack **keeps its volumes**. Losing the local database at
 * every Ctrl+C is daily friction, and the command that does reclaim disk is `pnpm clean`.
 *
 * Usage: `pnpm dev`
 */

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  allHealthy,
  composeArgv,
  parseComposePs,
  pendingServices,
  resolveComposeCli,
} from './lib/compose.mjs';
import { run, runAttached } from './lib/exec.mjs';
import { cleanupOnce, kill, startProc } from './lib/proc.mjs';
import {
  SERVICES,
  loadDotEnv,
  projectName,
  resolvePorts,
  serviceUrls,
  workspaceStatus,
} from './lib/stack.mjs';
import { bold, cyan, dim, fail, hint, info, line, ok, title, warn } from './lib/ui.mjs';
import { WaitError, waitForHttp, waitUntil } from './lib/wait.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Services get this long to report healthy before the script gives up and cleans up. */
const STACK_TIMEOUT_MS = 180_000;

/** The workspaces started in watch mode, in start order. Torn down in reverse. */
const WATCHED = ['backend', 'web'];

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

/**
 * Holds the process in the foreground.
 *
 * `pnpm dev` is a foreground command: it stays until Ctrl+C, and Ctrl+C is what stops the stack.
 * Without this it would exit the moment `main` returns whenever there is no watch process to
 * keep the event loop alive — which is exactly the state of the repository before F3 and F4 —
 * leaving the containers up and no way to stop them but `docker`.
 *
 * @type {NodeJS.Timeout | null}
 */
let foreground = null;

// Before anything reads the environment: compose loads `.env` on its own, node does not, and
// the ports printed in the URL board have to be the ones compose actually published.
loadDotEnv(repoRoot);

const composeCli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));
const project = projectName(process.env);

/**
 * One compose call against the development project.
 *
 * @param {readonly string[]} args
 * @param {{ attached?: boolean }} [options]
 * @returns {import('./lib/exec.mjs').RunResult}
 */
function compose(args, options = {}) {
  if (composeCli === null) {
    return { found: false, code: 127, stdout: '', stderr: 'no compose' };
  }

  const argv = composeArgv(composeCli, project, args);
  const invoke = options.attached === true ? runAttached : run;

  return invoke(argv.command, argv.args, { cwd: repoRoot, timeoutMs: STACK_TIMEOUT_MS });
}

/** @returns {import('./lib/compose.mjs').ServiceStatus[]} */
function serviceStatuses() {
  return parseComposePs(compose(['ps', '--all', '--format', 'json']).stdout);
}

/**
 * @param {ReturnType<typeof serviceUrls>} urls
 * @param {readonly string[]} running workspaces started in watch mode
 */
function board(urls, running) {
  /** @param {string} workspace @param {string} url */
  const target = (workspace, url) => (running.includes(workspace) ? cyan(url) : dim('not started'));

  line();
  line(`  ${bold('PostgreSQL')}  ${cyan(urls.postgres)}`);
  line(`  ${bold('Keycloak')}    ${cyan(urls.keycloak)}`);
  line(`  ${bold('Backend')}     ${target('backend', urls.backend)}`);
  line(`  ${bold('Web')}         ${target('web', urls.web)}`);
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

  if (composeCli !== null) {
    // `stop`, not `down`: see the header of this file.
    compose(['stop']);
  }

  ok('stopped', 'volumes preserved — `pnpm clean` is what reclaims them');
});

/** @returns {Promise<number | null>} exit code, or null to stay running */
async function main() {
  title('dev — local stack');

  const urls = serviceUrls(resolvePorts(process.env));

  if (composeCli === null) {
    fail('docker compose is not available');
    hint('install the Compose v2 plugin (docker-compose-plugin) or the docker-compose binary');
    hint('`pnpm doctor` checks this, and everything else the stack needs');
    return 1;
  }

  info(`compose: ${`${composeCli.command} ${composeCli.args.join(' ')}`.trimEnd()}`);

  const up = compose(['up', '--detach', '--remove-orphans'], { attached: true });
  if (up.code !== 0) {
    fail(`compose up failed with exit ${String(up.code)}`);
    hint('the output above is compose’s own; `pnpm doctor` checks the environment around it');
    return 1;
  }

  await waitUntil({
    target: `services ${SERVICES.join(', ')}`,
    timeoutMs: STACK_TIMEOUT_MS,
    intervalMs: 1_000,
    probe: () => Promise.resolve(allHealthy(serviceStatuses(), SERVICES)),
  });
  ok('postgres', urls.postgres);

  // Healthy is not the same as ready to serve: Keycloak answers /health/ready before it has
  // finished importing the realm, and the realm is what every client actually talks to.
  await waitForHttp(urls.discovery, { timeoutMs: STACK_TIMEOUT_MS, intervalMs: 1_000 });
  ok('keycloak', urls.realm);

  /** @type {string[]} */
  const running = [];

  for (const workspace of WATCHED) {
    const status = workspaceStatus(repoRoot, workspace);

    if (!status.ready) {
      warn(`${workspace} — ${String(status.reason)}`, 'skipped');
      continue;
    }

    children.push(
      startProc('pnpm', ['--filter', `./${workspace}`, 'dev'], {
        cwd: repoRoot,
        env: { ...process.env },
      }),
    );
    running.push(workspace);
    ok(workspace, 'watch');
  }

  board(urls, running);
  foreground = setInterval(() => {}, 60_000);
  return null;
}

for (const signalName of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
  process.on(signalName, () => {
    void shutdown().then(() => {
      process.exit(0);
    });
  });
}

try {
  const code = await main();

  if (code !== null) {
    await shutdown();
    process.exitCode = code;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));

  if (error instanceof WaitError && composeCli !== null) {
    const pending = pendingServices(serviceStatuses(), SERVICES);
    if (pending.length > 0) {
      hint(`still not up: ${pending.join(', ')} — \`${composeCli.command} logs\` says why`);
    }
  }

  await shutdown();
  process.exitCode = 1;
}
