#!/usr/bin/env node
/**
 * Gate 9: an ephemeral copy of the whole stack, the end-to-end suite against it, and no trace
 * left behind.
 *
 * It is the sibling of `start-local.mjs`, and differs from it in exactly four things:
 *
 * | | `start-local` | `run-e2e-local` |
 * |---|---|---|
 * | Ports | fixed | **random** (`findFreePort`) |
 * | Compose project | fixed | **unique per run** (`remote-claude-e2e-<port>`) |
 * | Teardown | `stop`, volumes kept | **`down --volumes --remove-orphans`** |
 * | Exit code | 0 | **the tests'** |
 *
 * Three details here look minor and are not:
 *
 * **Exiting with the tests' code.** A script that always exits 0 makes the gate decorative: CI
 * goes green with a red suite, which is worse than having no gate at all.
 *
 * **Purging before starting.** When a run dies abruptly the containers go but the *named volume*
 * survives, orphaned — and invisible to `compose ls`, which lists projects, and the project has
 * no containers any more. Nothing reclaims it, so the disk fills up over weeks.
 *
 * **Random ports plus a unique project.** That is what lets the suite run with `pnpm dev` up in
 * another terminal, and two suites run side by side in CI.
 *
 * Which suite it runs is the one thing the caller chooses.
 *
 * `pnpm test:e2e` runs the Playwright one — web and API. That is **gate 9**, and it is what
 * `pnpm verify:full` and every pull request run.
 *
 * `pnpm test:e2e:mobile` runs the Flutter `integration_test` against an identical stack. It is
 * deliberately **not** a mandatory gate: it needs an Android emulator, and an emulator plus the
 * Gradle build costs minutes and gigabytes — enough to bring a developer machine to its knees.
 * A gate nobody can afford to run is a gate that gets disabled, so this one is invoked on
 * purpose instead. See docs/plans/00-bootstrap/F6-scripts-e2e.md#o-e2e-do-mobile-não-é-portão.
 *
 * Neither is ever *skipped*: asked for and unable to run, each fails loudly rather than passing
 * by being absent.
 *
 * Usage: `pnpm test:e2e` · `pnpm test:e2e:mobile` — other arguments go to Playwright.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { purgeStaleProjects, resolveComposeCli } from './lib/compose.mjs';
import { run } from './lib/exec.mjs';
import { bringUp, composeRunner, stillPending, STACK_TIMEOUT_MS } from './lib/local-stack.mjs';
import { repoRoot } from './lib/paths.mjs';
import { findFreePort } from './lib/ports.mjs';
import { cleanupOnce, kill, onTermination, startProc } from './lib/proc.mjs';
import {
  E2E_PROJECT_PREFIX,
  e2eDotEnv,
  e2eProjectName,
  ephemeralEnvironment,
  serviceUrls,
} from './lib/stack.mjs';
import { bold, cyan, dim, fail, hint, info, line, ok, title, warn } from './lib/ui.mjs';
import { waitForHttp } from './lib/wait.mjs';

/** How long the backend and the web build get before the run is called a failure. */
const SERVICE_TIMEOUT_MS = 180_000;

/** Exit code used when the stack itself never came up, so no test ever ran. */
const STACK_FAILED = 1;

/** Where the suite reads the addresses of this particular run. Generated, and never committed. */
const dotEnvPath = path.join(repoRoot, 'e2e', '.env');

/** Which end of the suite this run is for. */
const mobile = process.argv.includes('--mobile');

/** Everything else, handed to Playwright unchanged. */
const playwrightArgs = process.argv.slice(2).filter((argument) => argument !== '--mobile');

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

const composeCli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));

/**
 * The compose caller of this run, once its project name exists.
 *
 * It lives out here because the teardown has to be able to take the stack down when `main` throws
 * halfway up — after the containers exist and before the suite ever ran.
 *
 * @type {import('./lib/local-stack.mjs').Compose | null}
 */
let compose = null;

/**
 * Reverse of the start order, and idempotent: a second Ctrl+C arrives while the first teardown is
 * still running, and the `finally` below runs on the same shutdown as the signal handler.
 */
const teardown = cleanupOnce(async () => {
  line();
  info('tearing the ephemeral stack down');

  for (const child of [...children].reverse()) {
    await kill(child);
  }

  if (compose !== null) {
    // `down --volumes`, not `stop`: nothing of an e2e run is worth keeping, and a volume kept is
    // a volume that outlives the project that owned it.
    const down = compose(['down', '--volumes', '--remove-orphans']);
    if (down.code !== 0) {
      warn('compose down did not exit cleanly', `exit ${String(down.code)}`);
    }
  }

  // Even when the run failed: a stale file pointing at ports nothing listens on turns the next
  // `pnpm exec playwright test` into a confusing timeout instead of a clear "run the script".
  fs.rmSync(dotEnvPath, { force: true });

  ok('nothing left', 'no containers, no volumes, no e2e/.env');
});

/**
 * Starts a long-lived process of the ephemeral stack, with its output attached to this terminal.
 *
 * @param {string} label
 * @param {readonly string[]} args arguments to `pnpm`
 * @param {NodeJS.ProcessEnv} env
 * @returns {import('node:child_process').ChildProcess}
 */
function startService(label, args, env) {
  info(`starting ${label}`);
  const child = startProc('pnpm', args, { cwd: repoRoot, env });
  children.push(child);
  return child;
}

/**
 * Brings the stack up and runs the suite.
 *
 * @returns {Promise<number>} the exit code of the suite, or of whatever stopped it from running
 */
async function main() {
  title(`test:e2e${mobile ? ':mobile' : ''} — ephemeral stack`);

  if (composeCli === null) {
    fail('docker compose is not available');
    hint('install the Compose v2 plugin (docker-compose-plugin) or the docker-compose binary');
    hint('`pnpm doctor` checks this, and everything else the stack needs');
    return STACK_FAILED;
  }

  // Step 0, before a single container of this run exists: what earlier runs left behind.
  const purged = purgeStaleProjects(
    (command, args) => run(command, args, { cwd: repoRoot, timeoutMs: STACK_TIMEOUT_MS }),
    composeCli,
    { prefix: E2E_PROJECT_PREFIX },
  );

  if (purged.projects.length + purged.volumes.length > 0) {
    warn(
      `purged ${String(purged.projects.length)} stale project(s) and ${String(purged.volumes.length)} orphan volume(s)`,
      'left by a run that was killed',
    );
  }
  for (const failure of purged.failures) {
    warn('could not purge', failure);
  }

  const [postgres, keycloak, backend, web] = await Promise.all([
    findFreePort(),
    findFreePort(),
    findFreePort(),
    findFreePort(),
  ]);

  const ports = { postgres, keycloak, backend, web };
  const urls = serviceUrls(ports);
  const project = e2eProjectName(ports.backend);

  // The stack inherits PATH and the like, and nothing else of the machine's configuration: the
  // repository `.env` is deliberately not loaded, so the suite cannot pass because of a value
  // that happens to be set on one developer's box.
  const env = { ...process.env, ...ephemeralEnvironment(ports), COMPOSE_PROJECT_NAME: project };

  compose = composeRunner(composeCli, project, { cwd: repoRoot, env });
  info(`project: ${bold(project)}`);

  await bringUp(compose, urls);

  // The backend applies its migrations on the way up, so there is no separate migrate step: an
  // extra one here would be a second implementation of "bring the schema up to date".
  const backendProc = startService('backend', ['--filter', './backend', 'start'], env);
  await waitForHttp(`${urls.backend}/health`, {
    proc: backendProc,
    timeoutMs: SERVICE_TIMEOUT_MS,
    intervalMs: 500,
  });
  ok('backend', urls.backend);

  // Built, then served — the suite exercises the bundle a user would get, not the dev server's
  // on-the-fly transforms. `VITE_*` is computed from this env at build time (web/env.ts), which
  // is why the build has to happen here and not before the ports were allocated.
  //
  // `NODE_ENV=production` for this half only. Vite hands `process.env.NODE_ENV` straight to the
  // bundle, and anything but `production` there ships the **development** build of React — which
  // double-invokes every effect and is not the artefact a user runs. The backend keeps `test`.
  const webEnv = { ...env, NODE_ENV: 'production' };

  const build = run('pnpm', ['--filter', './web', 'build'], {
    cwd: repoRoot,
    env: webEnv,
    timeoutMs: SERVICE_TIMEOUT_MS,
  });
  if (build.code !== 0) {
    fail(`the web build failed with exit ${String(build.code)}`);
    line(build.stdout.trim());
    line(build.stderr.trim());
    return build.code;
  }

  const webProc = startService('web', ['--filter', './web', 'preview'], webEnv);
  await waitForHttp(urls.web, { proc: webProc, timeoutMs: SERVICE_TIMEOUT_MS, intervalMs: 500 });
  ok('web', urls.web);

  fs.writeFileSync(dotEnvPath, e2eDotEnv(ports), 'utf8');

  line();
  line(`  ${bold('Backend')}  ${cyan(urls.backend)}   ${bold('Web')}  ${cyan(urls.web)}`);
  line(`  ${bold('Keycloak')} ${cyan(urls.realm)}`);
  line(dim('the suite reads e2e/.env; everything here is torn down when it ends'));
  line();

  // `runAttached` would have been simpler, but the suite's own output is what a reader needs and
  // both runners write their report to stdout; piping and re-emitting keeps the output *and* the
  // exit code, which is the one thing this script must not lose.
  const suite = mobile
    ? run(process.execPath, [path.join(repoRoot, 'scripts/mobile.mjs'), 'test:e2e'], {
        cwd: repoRoot,
        env,
        timeoutMs: 1_800_000,
      })
    : run('pnpm', ['--filter', './e2e', 'exec', 'playwright', 'test', ...playwrightArgs], {
        cwd: repoRoot,
        env,
        timeoutMs: 1_800_000,
      });

  line(suite.stdout.trimEnd());
  if (suite.stderr.trim() !== '') {
    line(suite.stderr.trimEnd());
  }

  return suite.code;
}

// 130 is the shell's convention for "terminated by a signal": not a test failure, and not a
// success either — the suite never got to say.
onTermination(teardown, 130);

/** @type {number} */
let code;

try {
  code = await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));

  if (compose !== null) {
    const pending = stillPending(compose);
    if (pending.length > 0) {
      hint(`still not up: ${pending.join(', ')} — the compose output above says why`);
    }
  }

  code = STACK_FAILED;
} finally {
  await teardown();
}

if (code === 0) {
  ok(bold('e2e passed'));
} else {
  fail(bold(`e2e failed with exit ${String(code)}`), 'the suite output above says which spec');
}

process.exit(code);
