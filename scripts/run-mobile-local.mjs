#!/usr/bin/env node
/**
 * The mobile app, on an Android device, against the development stack `pnpm dev` keeps up.
 *
 *   .env → defines  →  the stack answers?  →  device (attached, or the AVD with a window)
 *        →  adb reverse of the API and issuer ports  →  flutter run, in the foreground
 *
 * It stays for as long as `flutter run` does: hot reload (`r`), hot restart (`R`) and everything
 * else Flutter offers are typed straight into it. It ends when Flutter does — `q`, the app's
 * connection lost, a failed build — or on Ctrl+C, and **whatever the way out, it takes back what
 * it set up**: the emulator it started goes down, the forwards it added are removed, the `adb`
 * server goes down if this run started it, and the Gradle daemons of the build are stopped.
 * A device that was attached before the run is used and left up, with the app stopped on it.
 *
 * It does not start the stack. That is `pnpm dev`'s job, in another terminal, and a second copy of
 * "bring PostgreSQL and Keycloak up" is exactly the pair that drifts; it checks the stack answers
 * before anything costly, and says how to start it when it does not.
 *
 * Usage: `pnpm dev:mobile [-- <flutter run arguments>]` — `--release`, for instance.
 *
 * The `dev:mobile` script `exec`s this file, for the reason `dev` does: pnpm's `sh` would take the
 * Ctrl+C itself and report a failure for a stop that went well.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  claimReported,
  deviceTools as androidDeviceTools,
  giveDeviceBack,
  reversePorts,
  startAdbServer,
  stopGradleDaemons,
  unreversePorts,
} from './lib/android-host.mjs';
import { EMULATOR_AVD, androidSdkRoot, waitForBoot, withSdkOnPath } from './lib/emulator.mjs';
import { commandExists } from './lib/exec.mjs';
import {
  ANDROID_PACKAGE,
  flutterRunArgs,
  forwardedPorts,
  localDefines,
  pubspecVersion,
} from './lib/mobile-local.mjs';
import { prepareMermaid } from './lib/mermaid-asset.mjs';
import { repoRoot } from './lib/paths.mjs';
import { cleanupOnce, kill, onTermination, runToExit, startProc } from './lib/proc.mjs';
import { HEALTH_PATH, loadDotEnv } from './lib/stack.mjs';
import { bold, cyan, dim, fail, fatal, hint, info, line, ok, title, warn } from './lib/ui.mjs';
import { answers } from './lib/wait.mjs';

/** How long each part of the stack gets to answer. It is either up already or it is not. */
const STACK_PROBE_TIMEOUT_MS = 5_000;

const mobileDir = path.join(repoRoot, 'mobile');

/** Where the Android SDK is — `adb` and `emulator` need not be on PATH. */
const sdkRoot = androidSdkRoot(process.env, os.homedir(), process.platform);

/** With a window: somebody is there to use the app. */
const deviceTools = androidDeviceTools(sdkRoot, { window: true });

/**
 * What this run set up, each kept out here so a teardown that runs halfway through — a Ctrl+C
 * during the boot — still knows what there is to take back.
 */
const owned = {
  /** @type {import('./lib/emulator.mjs').Device | null} */
  device: null,
  /** @type {number[]} */
  forwards: [],
  adbServer: false,
  /** @type {import('node:child_process').ChildProcess | null} */
  flutter: null,
};

/**
 * Takes back what the run set up, in reverse order. Idempotent: the Ctrl+C reaches Flutter too,
 * so its exit and the signal handler run this on the same shutdown.
 */
const teardown = cleanupOnce(async () => {
  // Refused before touching anything — no .env, no stack: there is nothing to take back, and
  // saying so would bury the reason it stopped.
  if (owned.device === null && !owned.adbServer) {
    return;
  }

  line();
  info('taking back what the run set up');

  if (owned.flutter !== null) {
    await kill(owned.flutter);
  }

  const device = owned.device;
  if (device !== null) {
    if (device.child === null) {
      // Somebody else's device: it stays up, without our app running or our forwards in it.
      deviceTools.adb(['-s', device.serial, 'shell', 'am', 'force-stop', ANDROID_PACKAGE]);
      const left = unreversePorts(deviceTools.adb, device.serial, owned.forwards);
      if (left.length > 0) {
        warn('forwards still on the device', left.map((port) => `tcp:${String(port)}`).join(' '));
      }
    }
    await giveDeviceBack(device, deviceTools);
  }

  if (owned.adbServer) {
    deviceTools.adb(['kill-server']);
    ok('adb server down', 'this run started it');
  }

  if (owned.flutter !== null) {
    stopGradleDaemons();
  }

  ok('nothing left', 'no emulator, forwards or build daemons of this run');
});

/**
 * Answers whether the stack `pnpm dev` keeps up is there, through the origin the app talks
 * through: the API and the login, both forwarded by the web server (plan 10, B-27).
 *
 * @param {Record<string, string>} defines
 * @returns {Promise<boolean>}
 */
async function stackAnswers(defines) {
  const probes = {
    backend: `${String(defines['RC_INTERNAL_URL'])}/api${HEALTH_PATH}`,
    issuer: `${String(defines['RC_INTERNAL_URL'])}${String(defines['RC_OIDC_REALM_PATH'])}/.well-known/openid-configuration`,
  };

  const results = await Promise.all(
    Object.entries(probes).map(async ([name, url]) => {
      const up = await answers(url, STACK_PROBE_TIMEOUT_MS);
      if (up) {
        ok(name, url);
      } else {
        fail(name, `${url} did not answer`);
      }
      return up;
    }),
  );

  return results.every(Boolean);
}

/**
 * Claims the device and waits for it to boot.
 *
 * @returns {Promise<boolean>} whether there is a booted device to run on
 */
async function bootDevice() {
  owned.adbServer = startAdbServer(deviceTools.adb);

  const device = claimReported(deviceTools, sdkRoot, {
    kept: 'it stays up afterwards',
    started: 'it goes down when this run ends',
  });
  if (device === null) {
    return false;
  }
  owned.device = device;

  try {
    await waitForBoot(device, deviceTools);
  } catch (error) {
    fail('the device did not boot', /** @type {Error} */ (error).message);
    hint(`the AVD is created once, as the README says under Testes: ${EMULATOR_AVD}`);
    return false;
  }

  ok('device ready', device.serial);
  return true;
}

/**
 * Runs `flutter run` in the foreground until it ends.
 *
 * @param {string} serial
 * @param {Record<string, string>} defines
 * @returns {Promise<number>} Flutter's exit code
 */
function runApp(serial, defines) {
  const flutter = startProc('flutter', flutterRunArgs(serial, defines, process.argv.slice(2)), {
    cwd: mobileDir,
    env: withSdkOnPath(process.env, sdkRoot),
    foreground: true,
  });
  owned.flutter = flutter;

  return new Promise((resolve) => {
    flutter.once('error', (error) => {
      fail('flutter could not start', error.message);
      resolve(1);
    });
    flutter.once('exit', (code, signal) => {
      resolve(code ?? (signal === null ? 1 : 128));
    });
  });
}

/** @returns {Promise<number>} the exit code of the run */
async function main() {
  title('dev:mobile — the app against the local stack');

  // A missing file is not an error of its own: what is missing is the variables, and those are
  // named one by one below — the same file `pnpm dev` reads, and the same rule it follows.
  const loaded = loadDotEnv(repoRoot);

  const version = pubspecVersion(fs.readFileSync(path.join(mobileDir, 'pubspec.yaml'), 'utf8'));
  const built = localDefines(process.env, version);
  if ('problems' in built) {
    fatal('the .env cannot configure the app');
    for (const problem of built.problems) {
      hint(problem);
    }
    if (!loaded) {
      hint('there is no .env: cp .env.example .env');
    }
    return 1;
  }

  // The diagrams of the file viewer are the web's Mermaid, copied before the build — and a web on
  // another Mermaid known before anything slow starts (plan 25, D-20).
  if (!prepareMermaid(repoRoot)) {
    return 1;
  }

  // Before Flutter and the device: both are slow to find out about, and the stack is the one
  // thing this script expects somebody else to have started.
  if (!(await stackAnswers(built.defines))) {
    hint('start the stack in another terminal with `pnpm dev`, then run this again');
    return 1;
  }

  if (!commandExists('flutter')) {
    fatal('flutter is not on PATH');
    hint('install Flutter (https://docs.flutter.dev/get-started/install), then run this again');
    return 1;
  }

  if (!(await bootDevice())) {
    return 1;
  }

  const serial = /** @type {import('./lib/emulator.mjs').Device} */ (owned.device).serial;
  const ports = forwardedPorts(built.defines);
  const forwarded = reversePorts(deviceTools.adb, serial, ports);
  owned.forwards = forwarded.added;
  if (forwarded.problem !== null) {
    fail(forwarded.problem);
    hint('without the forward the app reaches nothing on this machine');
    return 1;
  }
  ok('forwarded to the device', ports.map((port) => `tcp:${String(port)}`).join(' '));

  line();
  line(`  ${dim('origin')}  ${cyan(String(built.defines['RC_INTERNAL_URL']))}`);
  line(`  ${dim('realm')}   ${cyan(String(built.defines['RC_OIDC_REALM_PATH']))}`);
  line(`  ${dim('device')}  ${cyan(serial)}`);
  line();
  info(`building and starting the app — ${bold('r')} reloads, ${bold('q')} or Ctrl+C ends the run`);

  return runApp(serial, built.defines);
}

// Ctrl+C is the documented way to stop it, so stopping cleanly is a success.
onTermination(teardown, 0);

process.exitCode = await runToExit(main, teardown, fail);
