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

import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import { resolveComposeCli } from './lib/compose.mjs';
import { run } from './lib/exec.mjs';
import { bringUp, composeRunner, stillPending } from './lib/local-stack.mjs';
import { cleanupOnce, kill, onTermination, startProc } from './lib/proc.mjs';
import {
  loadDotEnv,
  projectName,
  resolvePorts,
  serviceUrls,
  workspaceStatus,
} from './lib/stack.mjs';
import { bold, cyan, dim, fail, hint, info, line, ok, title, warn } from './lib/ui.mjs';
import { WaitError } from './lib/wait.mjs';

/** The workspaces started in watch mode, in start order. Torn down in reverse. */
const WATCHED = ['backend', 'web'];

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

// Before anything reads the environment: compose loads `.env` on its own, node does not, and
// the ports printed in the URL board have to be the ones compose actually published.
loadDotEnv(repoRoot);

const composeCli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));
const project = projectName(process.env);

/** One compose call against the development project. */
const compose = composeRunner(composeCli, project, { cwd: repoRoot });

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

  await bringUp(compose, urls);

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

  if (composeCli !== null) {
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
