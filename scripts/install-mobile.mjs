#!/usr/bin/env node
/**
 * The app installed on the phone in the USB cable, to be used without it (plan 10, F6).
 *
 *   .env → the addresses, said on the console  →  flutter on PATH?  →  the phone on USB
 *        →  flutter build apk --debug  →  adb install -r  →  the addresses again, and the phone
 *
 * The internal address is this machine on the local network — `http://<IP>:<web port>`, the web
 * dev server of `pnpm dev`, which forwards the API, the socket and the login — and the external one
 * is the origin `pnpm dev:public` publishes (D-22). The build is a debug one: it is the only build
 * that may talk `http://` to the local network (D-20, D-21).
 *
 * It does not need the stack: installing is the phone and the build. Whether the stack answers on
 * the internal address is said, not required — the app reaches it once `pnpm dev` is up.
 *
 * Whatever the way out, it takes back what it started: the `adb` server, when this run started it,
 * and the Gradle daemons of the build.
 *
 * Usage: `pnpm mobile:install [-- --device <serial>] [--dry-run]` — `--dry-run` only says which
 * addresses the app would be built with.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { deviceTools, startAdbServer, stopGradleDaemons } from './lib/android-host.mjs';
import { androidSdkRoot, withSdkOnPath } from './lib/emulator.mjs';
import { commandExists, run, runAttached } from './lib/exec.mjs';
import { resolveLanAddress } from './lib/lan.mjs';
import {
  DEBUG_APK,
  USAGE,
  buildAndInstall,
  installAddresses,
  parseInstallArgs,
  pickDevice,
  usbDevices,
} from './lib/mobile-install.mjs';
import { localDefines, pubspecVersion } from './lib/mobile-local.mjs';
import { repoRoot } from './lib/paths.mjs';
import { cleanupOnce, onTermination, runToExit } from './lib/proc.mjs';
import { PUBLIC_ORIGIN_FILE, readRecordedOrigin } from './lib/public-url.mjs';
import { HEALTH_PATH, loadDotEnv } from './lib/stack.mjs';
import { cyan, dim, fail, fatal, hint, info, line, ok, title, warn } from './lib/ui.mjs';
import { answers } from './lib/wait.mjs';

/** How long the stack gets to answer. It is either up already or it is not. */
const STACK_PROBE_TIMEOUT_MS = 3_000;

/** A debug APK is large, and a USB 2 cable is slow. */
const INSTALL_TIMEOUT_MS = 300_000;

/** A first build downloads Gradle and the Android dependencies. */
const BUILD_TIMEOUT_MS = 1_800_000;

const mobileDir = path.join(repoRoot, 'mobile');

/** Where the Android SDK is — `adb` need not be on PATH. */
const sdkRoot = androidSdkRoot(process.env, os.homedir(), process.platform);
const adbPath = path.join(sdkRoot, 'platform-tools', 'adb');
const adb = deviceTools(sdkRoot).adb;

/** What this run started, for the teardown — which may run halfway, on a Ctrl+C. */
const owned = { adbServer: false, built: false };

const teardown = cleanupOnce(() => {
  if (owned.built) {
    stopGradleDaemons();
  }

  if (owned.adbServer) {
    adb(['kill-server']);
    ok('adb server down', 'this run started it');
  }

  return Promise.resolve();
});

/**
 * Says which addresses the app is built with, and where each came from.
 *
 * @param {Record<string, string>} defines
 * @param {{ internal: import('./lib/mobile-install.mjs').Address,
 *           external: import('./lib/mobile-install.mjs').Address }} addresses
 */
function printAddresses(defines, addresses) {
  const rows = [
    ['internal', addresses.internal.url, addresses.internal.source],
    ['external', addresses.external.url, addresses.external.source],
    ['realm', String(defines['RC_OIDC_REALM_PATH']), 'OIDC_ISSUER in .env'],
    ['version', String(defines['RC_APP_VERSION']), 'mobile/pubspec.yaml'],
  ];

  line();
  for (const [label, value, source] of rows) {
    const shown = value === '' ? dim('— off') : cyan(String(value));
    line(`  ${dim(String(label).padEnd(8))}  ${shown}  ${dim(String(source))}`);
  }
  line();
}

/**
 * Says whether the stack answers on the internal address. Never fatal: the app is installed for
 * later, and reaches the stack once it is up.
 *
 * @param {string} internal
 */
async function probeStack(internal) {
  if (internal === '') {
    return;
  }

  const url = `${internal}/api${HEALTH_PATH}`;
  if (await answers(url, STACK_PROBE_TIMEOUT_MS)) {
    ok('the stack answers on the internal address', url);
    return;
  }

  warn('the stack does not answer on the internal address', url);
  hint('the app reaches it once `pnpm dev` is up — and the phone is on the same network');
}

/**
 * The phone in the cable, or `null` after saying why there is none.
 *
 * @param {string | null} requested
 * @returns {import('./lib/mobile-install.mjs').UsbDevice | null}
 */
function findPhone(requested) {
  owned.adbServer = startAdbServer(adb);

  const listed = adb(['devices', '-l']);
  if (!listed.found) {
    fatal('adb is not where the Android SDK should be');
    hint(`looked for ${adbPath} — ANDROID_HOME names another SDK`);
    return null;
  }

  const picked = pickDevice(usbDevices(listed.stdout), requested);
  if ('problem' in picked) {
    fail(picked.problem);
    hint(picked.hint);
    return null;
  }

  ok('phone on USB', `${picked.device.serial} — ${picked.device.model}`);
  return picked.device;
}

/**
 * Builds the debug APK and installs it on [serial].
 *
 * @param {string} serial
 * @param {Record<string, string>} defines
 * @returns {boolean} whether the app is on the phone
 */
function install(serial, defines) {
  info(`building the debug APK, then installing it on ${serial}`);
  owned.built = true;

  const outcome = buildAndInstall(
    {
      flutter: (args) =>
        runAttached('flutter', args, {
          cwd: mobileDir,
          env: withSdkOnPath(process.env, sdkRoot),
          timeoutMs: BUILD_TIMEOUT_MS,
        }),
      adb: (args) => run(adbPath, args, { timeoutMs: INSTALL_TIMEOUT_MS }),
    },
    serial,
    defines,
    path.join(mobileDir, DEBUG_APK),
  );

  if ('problem' in outcome) {
    fail(outcome.problem, outcome.detail);
    if (outcome.hint !== null) {
      hint(outcome.hint);
    }
    return false;
  }

  return true;
}

/**
 * The defines of the build and its two addresses, from the `.env` — or `null`, after naming every
 * reason there cannot be one.
 *
 * @returns {{ defines: Record<string, string>,
 *             addresses: { internal: import('./lib/mobile-install.mjs').Address,
 *                          external: import('./lib/mobile-install.mjs').Address } } | null}
 */
function resolveBuild() {
  const loaded = loadDotEnv(repoRoot);
  const lan = resolveLanAddress(process.env);
  const version = pubspecVersion(fs.readFileSync(path.join(mobileDir, 'pubspec.yaml'), 'utf8'));
  const built = localDefines(process.env, version);
  const addresses =
    'problem' in lan
      ? { problems: [lan.problem] }
      : installAddresses(process.env, {
          lan,
          recorded: {
            origin: readRecordedOrigin(path.join(repoRoot, PUBLIC_ORIGIN_FILE)),
            file: PUBLIC_ORIGIN_FILE,
          },
        });

  if ('problems' in built || 'problems' in addresses) {
    fatal('the .env cannot configure the app');
    const problems = [
      ...('problems' in built ? built.problems : []),
      ...('problems' in addresses ? addresses.problems : []),
    ];
    for (const problem of new Set(problems)) {
      hint(problem);
    }
    if (!loaded) {
      hint('there is no .env: cp .env.example .env');
    }
    return null;
  }

  return {
    defines: {
      ...built.defines,
      RC_INTERNAL_URL: addresses.internal.url,
      RC_EXTERNAL_URL: addresses.external.url,
    },
    addresses,
  };
}

/** @returns {Promise<number>} the exit code of the run */
async function main() {
  title('mobile:install — the app on the phone in the USB cable');

  const args = parseInstallArgs(process.argv.slice(2));
  if (!args.ok) {
    fail(args.message);
    hint(USAGE);
    return 1;
  }

  const resolved = resolveBuild();
  if (resolved === null) {
    return 1;
  }

  const { defines, addresses } = resolved;
  info('the app is built with these addresses');
  printAddresses(defines, addresses);

  if (args.dryRun) {
    ok('dry run', 'nothing was built or installed');
    return 0;
  }

  await probeStack(addresses.internal.url);

  if (!commandExists('flutter')) {
    fatal('flutter is not on PATH');
    hint('install Flutter (https://docs.flutter.dev/get-started/install), then run this again');
    return 1;
  }

  const phone = findPhone(args.device);
  if (phone === null || !install(phone.serial, defines)) {
    return 1;
  }

  ok('installed', `${phone.serial} — ${phone.model}`);
  info('the app on the phone talks through');
  printAddresses(defines, addresses);
  hint('open the app; the address screen switches between internal and external');
  return 0;
}

// Ctrl+C mid-build is a way out like any other: what was started is taken back.
onTermination(teardown, 130);

process.exitCode = await runToExit(main, teardown, fail);
