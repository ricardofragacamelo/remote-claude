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
 * Usage: `pnpm dev`
 *
 * The `dev` script `exec`s this file. Without it pnpm's `sh` sits in between, takes the Ctrl+C
 * itself, and dies of it while this file is still tearing down — pnpm then reports
 * `ELIFECYCLE Command failed` for a stop that went well.
 */

import fs from 'node:fs';
import process from 'node:process';

import { LOCAL_ALLOWLIST_FILE, activeAllowlist, withActiveAllowlist } from './lib/allowlist.mjs';
import { repoRoot } from './lib/paths.mjs';
import { resolveComposeCli } from './lib/compose.mjs';
import { run } from './lib/exec.mjs';
import { bringUp, composeRunner, stillPending } from './lib/local-stack.mjs';
import { cleanupOnce, kill, onTermination, startProc } from './lib/proc.mjs';
import {
  HEALTH_PATH,
  boardRows,
  lanAddress,
  loadDotEnv,
  projectName,
  resolvePorts,
  serviceUrls,
  watchEnvironment,
  workspaceStatus,
} from './lib/stack.mjs';
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

// Before anything reads the environment: compose loads `.env` on its own, node does not, and
// the ports printed in the URL board have to be the ones compose actually published.
loadDotEnv(repoRoot);

// The backend refuses to start when a root of the allowlist does not exist. Creating the
// development roots here is what keeps that rule from turning a fresh clone into a boot failure.
ensureDeclaredRoots();

const composeCli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));
const project = projectName(process.env);

/** One compose call against the development project. */
const compose = composeRunner(composeCli, project, { cwd: repoRoot });

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

  if (composeCli !== null) {
    // `stop`, not `down`: see the header of this file. In its own process group, so the second
    // Ctrl+C of an impatient hand does not interrupt it halfway and leave containers up.
    const stop = compose(['stop'], { ownProcessGroup: true });
    if (stop.code !== 0) {
      warn('compose stop did not exit cleanly', `exit ${String(stop.code)}`);
      hint('`docker ps` shows what is still up');
      return;
    }
  }

  ok('stopped', 'volumes preserved — `pnpm clean` is what reclaims them');
});

/** @returns {Promise<number | null>} exit code, or null to stay running */
async function main() {
  title('dev — local stack');

  const ports = resolvePorts(process.env);
  const urls = serviceUrls(ports);

  if (composeCli === null) {
    fail('docker compose is not available');
    hint('install the Compose v2 plugin (docker-compose-plugin) or the docker-compose binary');
    hint('`pnpm doctor` checks this, and everything else the stack needs');
    return 1;
  }

  info(`compose: ${`${composeCli.command} ${composeCli.args.join(' ')}`.trimEnd()}`);

  await bringUp(compose, urls);

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
