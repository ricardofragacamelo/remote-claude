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
 * **The app's runs bring their own device, and take it away again.** With a device already
 * attached, the suite uses it and leaves it as it found it. With none, this script starts the
 * suite's emulator while the stack comes up, and takes it down in the teardown — together with the
 * Gradle daemons the build left behind, which otherwise hold gigabytes until the next
 * `pnpm verify:full` times out on them. See `scripts/lib/emulator.mjs`.
 *
 * **A second backend, with its web, runs beside the first** — the limits stack (plan 05, F4). The
 * scenarios of the limits need a ceiling of two, a TTL of seconds and the product's own rate, and
 * every other spec needs the opposite; one backend cannot be both. It shares PostgreSQL and
 * Keycloak with the main one, and has its own two ports (`LIMITS_STACK` in `scripts/lib/stack.mjs`).
 * The live run does not start it: its suite is about the real Claude, not about the limits.
 *
 * `pnpm test:e2e:live` runs `e2e/smoke-live/` against the **real** Claude on this machine. It is
 * the one suite that is not hermetic and the only one that costs money per run, so it is never a
 * gate — it exists to catch the SDK changing its contract under us, which nothing else can.
 *
 * **Which backend comes up is the other thing that differs.** The default run starts
 * `backend start:scripted`: the same application, with the one provider that would spawn the
 * Claude CLI replaced by a replay of a recorded run. `--live` starts the product's own entry
 * point. An end-to-end suite has to be deterministic and Claude is not; a suite that talked to
 * the real model on every pull request would be a suite that is eventually deleted.
 *
 * Usage: `pnpm test:e2e` · `pnpm test:e2e:mobile [suite…]` · `pnpm test:e2e:live` — other
 * arguments go to Playwright, or, for the app, name the suites of `integration_test/` to run.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { purgeStaleProjects, resolveComposeCli } from './lib/compose.mjs';
import {
  claimReported,
  deviceTools as androidDeviceTools,
  giveDeviceBack,
  stopGradleDaemons,
} from './lib/android-host.mjs';
import { EMULATOR_AVD, androidSdkRoot, waitForBoot, withSdkOnPath } from './lib/emulator.mjs';
import { run, runAsync } from './lib/exec.mjs';
import { bringUp, composeRunner, stillPending, STACK_TIMEOUT_MS } from './lib/local-stack.mjs';
import { repoRoot } from './lib/paths.mjs';
import { findFreePort } from './lib/ports.mjs';
import { cleanupOnce, kill, onTermination, processAlive, startProc } from './lib/proc.mjs';
import {
  BACKEND_LOG_FILE,
  E2E_PROJECT_PREFIX,
  e2eDotEnv,
  e2eProjectName,
  projectOwner,
  ephemeralEnvironment,
  limitsEnvironment,
  realPushEnvironment,
  serviceUrls,
} from './lib/stack.mjs';
import { bold, cyan, dim, fail, fatal, hint, info, line, ok, title, warn } from './lib/ui.mjs';
import { waitForHttp } from './lib/wait.mjs';
import { ensureDeclaredRoots } from './lib/workspaces.mjs';

/** How long the backend and the web build get before the run is called a failure. */
const SERVICE_TIMEOUT_MS = 180_000;

/** Exit code used when the stack itself never came up, so no test ever ran. */
const STACK_FAILED = 1;

/** Where the suite reads the addresses of this particular run. Generated, and never committed. */
const dotEnvPath = path.join(repoRoot, 'e2e', '.env');

/**
 * Where the backend's own log of this run is kept — every run, and gone in the teardown.
 *
 * The live suite reads it for the line the mapper writes when the SDK sends a message variant this
 * build has never seen: a contract break that only shows up as a log line nobody reads is a
 * contract break that reaches production quietly. The hermetic one reads it for what the backend
 * says of its own HTTP edges — the status a refusal is logged with (`http-contract`).
 */
const backendLogPath = BACKEND_LOG_FILE;

/**
 * Whether this run really notifies — the app's suite, with the push settings of the `.env` in place
 * of the hermetic ones (plan 02, D-26). Never part of the default suite: it reaches a provider
 * outside this machine, and it needs a device with Play Services.
 */
const push = process.argv.includes('--push');

/** Which end of the suite this run is for. The real-push run is the app's. */
const mobile = push || process.argv.includes('--mobile');

/** Whether the real Claude is behind the backend, rather than a replay of a recorded run. */
const live = process.argv.includes('--live');

/** The flags this script owns. Everything else is handed to Playwright unchanged. */
const OWN_FLAGS = new Set(['--mobile', '--live', '--push']);

const playwrightArgs = [
  ...process.argv.slice(2).filter((argument) => !OWN_FLAGS.has(argument)),
  // The live suite is excluded from the default run by `playwright.config.ts`, so naming it is
  // the only way to run it — and naming it is deliberate, never accidental.
  ...(live ? ['smoke-live', '--config', 'playwright.live.config.ts'] : []),
];

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

/** Where the Android SDK is, for the app's runs — `adb` and `emulator` need not be on PATH. */
const sdkRoot = androidSdkRoot(process.env, os.homedir(), process.platform);

/** @type {import('./lib/emulator.mjs').DeviceTools} */
const deviceTools = androidDeviceTools(sdkRoot);

/**
 * The device of an app run, once claimed. Out here for the same reason as `compose`: a teardown
 * halfway through the boot still has to take the emulator down.
 *
 * @type {import('./lib/emulator.mjs').Device | null}
 */
let device = null;

/** Whether the app was built at all — only then are there Gradle daemons to stop. */
let appBuilt = false;

/**
 * Where the web bundle of the limits stack is built, once it is. Outside the repository: a second
 * `web/dist` would be one more folder for the formatter and the linters to trip over, and this one
 * is gone when the run ends.
 *
 * @type {string | null}
 */
let limitsWebDir = null;

/**
 * Takes this run's compose project down, if it got as far as having one.
 */
function takeStackDown() {
  if (compose === null) {
    return;
  }

  // `down --volumes`, not `stop`: nothing of an e2e run is worth keeping, and a volume kept is
  // a volume that outlives the project that owned it.
  const down = compose(['down', '--volumes', '--remove-orphans'], { ownProcessGroup: true });
  if (down.code !== 0) {
    warn('compose down did not exit cleanly', `exit ${String(down.code)}`);
  }
}

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

  takeStackDown();
  if (device !== null) {
    await giveDeviceBack(device, deviceTools);
  }
  if (appBuilt) {
    stopGradleDaemons();
  }

  // Even when the run failed: a stale file pointing at ports nothing listens on turns the next
  // `pnpm exec playwright test` into a confusing timeout instead of a clear "run the script".
  fs.rmSync(dotEnvPath, { force: true });
  fs.rmSync(backendLogPath, { force: true });
  if (limitsWebDir !== null) {
    fs.rmSync(limitsWebDir, { recursive: true, force: true });
  }

  ok(
    'nothing left',
    `no containers, no volumes, no e2e/.env${mobile ? ', no emulator of ours' : ''}`,
  );
});

/**
 * Starts a long-lived process of the ephemeral stack, with its output attached to this terminal.
 *
 * @param {string} label
 * @param {readonly string[]} args arguments to `pnpm`
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [logFile] where to keep a copy of its output, for a suite that reads it
 * @returns {import('node:child_process').ChildProcess}
 */
function startService(label, args, env, logFile) {
  info(`starting ${label}`);

  const child =
    logFile === undefined
      ? startProc('pnpm', args, { cwd: repoRoot, env })
      : startProc('pnpm', args, { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });

  if (logFile !== undefined) {
    // Written **and** echoed: the file is what the suite reads, and the terminal is what a person
    // watching a run that takes minutes reads. Losing either would cost one of them.
    const sink = fs.createWriteStream(logFile, { flags: 'a' });

    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (chunk) => {
        sink.write(chunk);
        process.stdout.write(chunk);
      });
    }
  }

  children.push(child);
  return child;
}

/**
 * The push settings of the `.env`, for the run that really notifies — or nothing, for every other.
 *
 * A misconfigured `.env` stops the run before any container starts: a real-push run that fell
 * back to the hermetic settings would pass without notifying anybody, which is exactly what it
 * exists to catch.
 *
 * @returns {Record<string, string>}
 */
function realPushOrExit() {
  if (!push) {
    return {};
  }

  const dotEnv = path.join(repoRoot, '.env');
  const result = fs.existsSync(dotEnv)
    ? realPushEnvironment(fs.readFileSync(dotEnv, 'utf8'))
    : { problem: 'there is no .env to take the push settings from' };

  if ('problem' in result) {
    fatal(`the real-push run cannot start: ${result.problem}`);
    hint('set RC_PUSH_ENDPOINT, RC_PUSH_CREDENTIALS_FILE and RC_PUSH_SCOPE in .env');
    process.exit(1);
  }

  warn('this run really notifies', 'it reaches the push provider, outside this machine');

  // The scripted backend fails the first announcement it hands the provider, so the notification
  // that reaches the tray is the one its retry sent — plan 05, S-53. The scenario the suite already
  // runs proves both: the retry happened, and the phone still got its question.
  return { ...result.env, RC_E2E_PUSH_FAIL_FIRST: '1' };
}

/**
 * Claims the device of an app run and starts waiting for it to boot.
 *
 * @returns {Promise<string | null> | null} what stopped the boot, or `null` once it finished —
 *   or `null` instead of a promise when there is no device to be had at all
 */
function claimAndBoot() {
  device = claimReported(deviceTools, sdkRoot, {
    kept: 'it stays as it was',
    started: 'it goes down with the stack',
  });
  if (device === null) {
    return null;
  }

  return waitForBoot(device, deviceTools).then(
    () => null,
    (/** @type {Error} */ error) => error.message,
  );
}

/**
 * The name of this run in its title — `test:e2e`, plus the suffix of each flag it was given.
 *
 * @returns {string}
 */
function runLabel() {
  return `test:e2e${mobile ? ':mobile' : ''}${push ? ':push' : ''}${live ? ':live' : ''}`;
}

/**
 * Whether the run that owns a project is still going — another one, beside this.
 *
 * @param {string} project
 * @returns {boolean}
 */
function ownerIsRunning(project) {
  const owner = projectOwner(project);
  return owner !== null && owner !== process.pid && processAlive(owner);
}

/**
 * Step 0, before a single container of this run exists: what earlier runs left behind.
 *
 * @param {import('./lib/compose.mjs').ComposeCli} cli
 */
function purgeLeftovers(cli) {
  const purged = purgeStaleProjects(
    (command, args) => run(command, args, { cwd: repoRoot, timeoutMs: STACK_TIMEOUT_MS }),
    cli,
    // A project whose owner is still running belongs to a run beside this one, not to the past.
    { prefix: E2E_PROJECT_PREFIX, isLive: ownerIsRunning },
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
}

/**
 * Starts a backend process of this run and waits for it to answer.
 *
 * @param {string} label
 * @param {readonly string[]} args arguments to `pnpm`
 * @param {string} url where it answers
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [logFile]
 */
async function startAndWait(label, args, url, env, logFile) {
  const proc = startService(label, args, env, logFile);
  await waitForHttp(`${url}/health`, { proc, timeoutMs: SERVICE_TIMEOUT_MS, intervalMs: 500 });
  ok(label, url);
}

/**
 * Starts the backend and waits for it to answer.
 *
 * The backend applies its migrations on the way up, so there is no separate migrate step: an
 * extra one here would be a second implementation of "bring the schema up to date".
 * The scripted entry point is the same application with the Agent SDK replaced by a replay of a
 * recorded run; `--live` starts the product's own. Neither is a flag inside `src/`: a switch in
 * the product that replaces the Agent SDK is a switch that eventually ships switched on.
 *
 * @param {{ backend: string }} urls
 * @param {NodeJS.ProcessEnv} env
 */
async function startBackend(urls, env) {
  fs.rmSync(backendLogPath, { force: true });

  await startAndWait(
    'backend',
    ['--filter', './backend', live ? 'start' : 'start:scripted'],
    urls.backend,
    env,
    // Written as well as shown, and removed in the teardown: it never outlives the run.
    backendLogPath,
  );
}

/**
 * Builds the web bundle and serves it.
 *
 * Built, then served — the suite exercises the bundle a user would get, not the dev server's
 * on-the-fly transforms. `VITE_*` is computed from this env at build time (web/env.ts), which
 * is why the build has to happen here and not before the ports were allocated.
 *
 * `NODE_ENV=production` for this half only. Vite hands `process.env.NODE_ENV` straight to the
 * bundle, and anything but `production` there ships the **development** build of React — which
 * double-invokes every effect and is not the artefact a user runs. The backend keeps `test`.
 *
 * @param {{ web: string }} urls
 * @param {NodeJS.ProcessEnv} env
 * @param {{ label?: string, outDir?: string }} [target] where the bundle goes, for the second web
 *   of the run — `web/dist` when left out
 * @returns {Promise<number | null>} the exit code of a build that failed, or `null` once it serves
 */
async function startWeb(urls, env, target = {}) {
  const label = target.label ?? 'web';
  const webEnv = { ...env, NODE_ENV: 'production' };
  const outDir = target.outDir === undefined ? [] : ['--outDir', target.outDir, '--emptyOutDir'];

  const build = run('pnpm', ['--filter', './web', 'build', ...outDir], {
    cwd: repoRoot,
    env: webEnv,
    timeoutMs: SERVICE_TIMEOUT_MS,
  });
  if (build.code !== 0) {
    fail(`the ${label} build failed with exit ${String(build.code)}`);
    line(build.stdout.trim());
    line(build.stderr.trim());
    return build.code;
  }

  const preview = ['--filter', './web', 'preview', ...outDir.slice(0, 2)];
  const webProc = startService(label, preview, webEnv, undefined);
  await waitForHttp(urls.web, { proc: webProc, timeoutMs: SERVICE_TIMEOUT_MS, intervalMs: 500 });
  ok(label, urls.web);
  return null;
}

/**
 * Brings the limits stack up — its backend, then its web — once the main backend has applied the
 * migrations both of them read.
 *
 * After the main one, not beside it: two backends applying the same migrations to one database at
 * the same instant is a race this run has no reason to host.
 *
 * @param {import('./lib/stack.mjs').StackPorts} ports
 * @param {import('./lib/stack.mjs').LimitsPorts} limits
 * @param {NodeJS.ProcessEnv} env the main stack's
 * @returns {Promise<number | null>} the exit code of a build that failed, or `null` once it serves
 */
async function startLimitsStack(ports, limits, env) {
  const limitsEnv = { ...env, ...limitsEnvironment(ports, limits) };
  const urls = serviceUrls({ ...ports, ...limits });

  await startAndWait(
    'limits backend',
    ['--filter', './backend', 'start:scripted'],
    urls.backend,
    limitsEnv,
  );

  limitsWebDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-claude-web-limits-'));
  return startWeb(urls, limitsEnv, { label: 'limits web', outDir: limitsWebDir });
}

/**
 * Runs the suite this run is for, and prints what it said.
 *
 * `runAttached` would have been simpler, but the suite's own output is what a reader needs and
 * both runners write their report to stdout; piping and re-emitting keeps the output *and* the
 * exit code, which is the one thing this script must not lose.
 *
 * **Without blocking the event loop** (`runAsync`): the backend's output reaches this process
 * through a pipe, and it is this loop that drains it into the backend's log. A blocking run held
 * the loop for the whole suite — the log stopped at the boot, and whatever the backend wrote
 * waited in the pipe until the teardown, or blocked the backend once the pipe was full.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<number>} the suite's exit code
 */
async function runSuite(env) {
  appBuilt = mobile;
  const suite = await (mobile
    ? runAsync(
        process.execPath,
        // The other arguments of an app run name its suites (`pnpm test:e2e:mobile folders`).
        push
          ? [path.join(repoRoot, 'scripts/mobile.mjs'), 'test:e2e:push']
          : [path.join(repoRoot, 'scripts/mobile.mjs'), 'test:e2e', ...playwrightArgs],
        {
          cwd: repoRoot,
          env,
          timeoutMs: 1_800_000,
        },
      )
    : runAsync('pnpm', ['--filter', './e2e', 'exec', 'playwright', 'test', ...playwrightArgs], {
        cwd: repoRoot,
        env,
        timeoutMs: 1_800_000,
      }));

  line(suite.stdout.trimEnd());
  if (suite.stderr.trim() !== '') {
    line(suite.stderr.trimEnd());
  }

  return suite.code;
}

/**
 * Starts the processes of this run once the containers are up: the backend, the web, and the
 * limits stack when the run has one.
 *
 * @param {import('./lib/stack.mjs').StackPorts} ports
 * @param {import('./lib/stack.mjs').LimitsPorts | null} limits
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<number | null>} the exit code of a build that failed, or `null` once all serve
 */
async function startServices(ports, limits, env) {
  const urls = serviceUrls(ports);
  await startBackend(urls, env);

  const buildFailure = await startWeb(urls, env);
  if (buildFailure !== null || limits === null) {
    return buildFailure;
  }

  return startLimitsStack(ports, limits, env);
}

/**
 * Prints where everything of this run answers.
 *
 * @param {import('./lib/stack.mjs').StackPorts} ports
 * @param {import('./lib/stack.mjs').LimitsPorts | null} limits
 */
function printBoard(ports, limits) {
  const urls = serviceUrls(ports);

  line();
  line(`  ${bold('Backend')}  ${cyan(urls.backend)}   ${bold('Web')}  ${cyan(urls.web)}`);
  if (limits !== null) {
    const limitsUrls = serviceUrls({ ...ports, ...limits });
    line(
      `  ${bold('Limits')}   ${cyan(limitsUrls.backend)}   ${bold('Web')}  ${cyan(limitsUrls.web)}`,
    );
  }
  line(`  ${bold('Keycloak')} ${cyan(urls.realm)}`);
  line(dim('the suite reads e2e/.env; everything here is torn down when it ends'));
  line();
}

/**
 * Brings the stack up and runs the suite.
 *
 * @returns {Promise<number>} the exit code of the suite, or of whatever stopped it from running
 */
async function main() {
  title(`${runLabel()} — ephemeral stack`);

  if (live) {
    warn('this run talks to the real Claude', 'it is not hermetic, and it costs money');
  }

  if (composeCli === null) {
    fail('docker compose is not available');
    hint('install the Compose v2 plugin (docker-compose-plugin) or the docker-compose binary');
    hint('`pnpm doctor` checks this, and everything else the stack needs');
    return STACK_FAILED;
  }

  // The device before the stack: a machine with no SDK fails in a second instead of after the
  // containers, and an emulator boots in the minute the stack takes to come up anyway.
  const booted = mobile ? claimAndBoot() : Promise.resolve(null);
  if (booted === null) {
    return STACK_FAILED;
  }

  purgeLeftovers(composeCli);

  const [postgres, keycloak, backend, web, limitsBackend, limitsWeb] = await Promise.all([
    findFreePort(),
    findFreePort(),
    findFreePort(),
    findFreePort(),
    findFreePort(),
    findFreePort(),
  ]);

  const ports = { postgres, keycloak, backend, web };
  const limits = live ? null : { backend: limitsBackend, web: limitsWeb };
  const urls = serviceUrls(ports);
  const project = e2eProjectName(ports.backend);

  // The stack inherits PATH and the like, and nothing else of the machine's configuration: the
  // repository `.env` is deliberately not loaded, so the suite cannot pass because of a value
  // that happens to be set on one developer's box.
  // The live run is given no `CLAUDE_CONFIG_DIR` at all, so the CLI and the backend both fall
  // back to the layout the login actually lives in. Everything else isolates it, so a test never
  // edits somebody's `~/.claude.json`.
  const claudeConfig = live ? { claudeConfigDir: null } : {};

  const env = {
    ...(mobile ? withSdkOnPath(process.env, sdkRoot) : process.env),
    ...ephemeralEnvironment(ports, claudeConfig),
    ...realPushOrExit(),
    COMPOSE_PROJECT_NAME: project,
  };

  // The backend refuses to start when a root of the allowlist does not exist, so the roots have
  // to be there before it comes up — a run that fails for a missing /tmp directory looks nothing
  // like its cause.
  ensureDeclaredRoots();

  compose = composeRunner(composeCli, project, { cwd: repoRoot, env });
  info(`project: ${bold(project)}`);

  await bringUp(compose, urls);

  const serviceFailure = await startServices(ports, limits, env);
  if (serviceFailure !== null) {
    return serviceFailure;
  }

  const bootProblem = await booted;
  if (bootProblem !== null) {
    fail(bootProblem);
    hint(`run \`emulator -avd ${EMULATOR_AVD}\` by hand to see why, or attach a device first`);
    return STACK_FAILED;
  }

  fs.writeFileSync(dotEnvPath, e2eDotEnv(ports, { ...claudeConfig, limits }), 'utf8');

  printBoard(ports, limits);

  return runSuite(env);
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
