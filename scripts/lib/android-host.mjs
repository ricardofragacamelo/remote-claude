/**
 * The real tools behind the device of a run — the SDK's `adb`, the emulator process, the forwards
 * into the device, the `adb` server and the Gradle daemons a build of the app leaves behind.
 *
 * Two scripts own a device: `run-e2e-local` for the app's suites, and `run-mobile-local` for
 * `pnpm dev:mobile`. Both take down what they started and leave alone what they found, and that
 * rule is written here once, so the two cannot drift into different ideas of "clean".
 *
 * The calls into the host are handed in, so every branch is tested without an SDK; the default is
 * the real one.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  EMULATOR_AVD,
  EMULATOR_PORT,
  claimDevice,
  emulatorCommand,
  releaseDevice,
  withSdkOnPath,
} from './emulator.mjs';
import { commandExists, run } from './exec.mjs';
import { repoRoot } from './paths.mjs';
import { kill, startProc } from './proc.mjs';
import { bold, fail, hint, info, ok, warn } from './ui.mjs';

/** The Gradle wrapper Flutter writes, whose daemons outlive every build of the app. */
export const GRADLE_WRAPPER = path.join(
  repoRoot,
  'mobile',
  'android',
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
);

/** How long one `adb` call gets. A device that is still there answers in well under a second. */
const ADB_TIMEOUT_MS = 30_000;

/**
 * @typedef {object} Host
 * @property {typeof run} run
 * @property {typeof startProc} startProc
 * @property {typeof kill} kill
 * @property {typeof commandExists} commandExists
 * @property {(file: string) => boolean} exists
 * @property {NodeJS.Platform} platform
 * @property {NodeJS.ProcessEnv} env
 */

/** @type {Host} */
export const realHost = {
  run,
  startProc,
  kill,
  commandExists,
  exists: fs.existsSync,
  platform: process.platform,
  env: process.env,
};

/**
 * The tools `scripts/lib/emulator.mjs` drives a device with, wired to this machine.
 *
 * The emulator's output is ignored: it writes several lines a second for as long as it lives, and
 * a pipe nobody drains is a pipe that fills and freezes it. When it dies, the wait says so.
 *
 * @param {string} sdkRoot
 * @param {{ window?: boolean, host?: Host }} [options]
 * @returns {import('./emulator.mjs').DeviceTools}
 */
export function deviceTools(sdkRoot, options = {}) {
  const host = options.host ?? realHost;

  return {
    adb: (args) =>
      host.run(path.join(sdkRoot, 'platform-tools', 'adb'), args, { timeoutMs: ADB_TIMEOUT_MS }),
    startEmulator: () => {
      const fenced = host.platform === 'linux' && host.commandExists('systemd-run');
      const { command, args } = emulatorCommand({
        avd: EMULATOR_AVD,
        port: EMULATOR_PORT,
        fenced,
        window: options.window === true,
      });

      return host.startProc(command, args, {
        cwd: repoRoot,
        env: withSdkOnPath(host.env, sdkRoot),
        stdio: 'ignore',
      });
    },
    kill: (child) => host.kill(child),
  };
}

/**
 * Claims the device of a run — the attached one, or the emulator it starts — and says which.
 *
 * @param {import('./emulator.mjs').DeviceTools} tools
 * @param {string} sdkRoot where the SDK was looked for, for the hint when there is none
 * @param {{ kept: string, started: string }} fate what becomes of the device when the run ends,
 *   one sentence for each case — each run promises its own
 * @returns {import('./emulator.mjs').Device | null} `null` when there is no device to be had
 */
export function claimReported(tools, sdkRoot, fate) {
  const claimed = claimDevice(tools);

  if ('problem' in claimed) {
    fail(claimed.problem);
    hint(`looked for the SDK in ${sdkRoot}`);
    return null;
  }

  if (claimed.device.child === null) {
    ok('using the attached device', `${claimed.device.serial} — ${fate.kept}`);
  } else {
    info(`starting the emulator ${bold(EMULATOR_AVD)} — ${fate.started}`);
  }

  return claimed.device;
}

/**
 * Starts the `adb` server, and answers whether this call is what started it.
 *
 * The server is a daemon shared by everything that talks to a device — Android Studio, another
 * terminal. One that was already running is somebody else's, and stays; one this run started is
 * the run's, and goes down with it.
 *
 * @param {import('./emulator.mjs').DeviceTools['adb']} adb
 * @returns {boolean}
 */
export function startAdbServer(adb) {
  const started = adb(['start-server']);
  return (
    started.code === 0 && /daemon started successfully/.test(`${started.stdout}${started.stderr}`)
  );
}

/**
 * The device-side ports `adb reverse --list` reports as already forwarded.
 *
 * Each row ends in `tcp:<device> tcp:<host>`, after a transport name that changed between `adb`
 * versions (`(reverse)`, `UsbFfs`, `host-12`) — so only the end of the row is read.
 *
 * @param {string} output
 * @returns {number[]}
 */
export function reversedPorts(output) {
  return output
    .split('\n')
    .map((row) => /tcp:(\d+)\s+tcp:\d+\s*$/.exec(row.trim())?.[1])
    .filter((port) => port !== undefined)
    .map(Number);
}

/**
 * Forwards each port of the device to the same port of this machine, and answers which forwards
 * it added.
 *
 * A port already forwarded is left as it is and not counted as added: it belongs to whoever made
 * it — another run on the same device — and removing it on the way out would cut that run off.
 *
 * @param {import('./emulator.mjs').DeviceTools['adb']} adb
 * @param {string} serial
 * @param {readonly number[]} ports
 * @returns {{ added: number[], problem: string | null }} `problem` names the first port that could
 *   not be forwarded; the ones added before it are in `added`, for the teardown to remove
 */
export function reversePorts(adb, serial, ports) {
  const listed = adb(['-s', serial, 'reverse', '--list']);
  const existing = new Set(listed.code === 0 ? reversedPorts(listed.stdout) : []);

  /** @type {number[]} */
  const added = [];
  for (const port of ports.filter((candidate) => !existing.has(candidate))) {
    const forwarded = adb(['-s', serial, 'reverse', `tcp:${String(port)}`, `tcp:${String(port)}`]);

    if (forwarded.code !== 0) {
      return {
        added,
        problem: `adb reverse tcp:${String(port)} failed: ${forwarded.stderr.trim()}`,
      };
    }
    added.push(port);
  }

  return { added, problem: null };
}

/**
 * Removes the forwards a run added, and answers the ports it could not remove.
 *
 * A failure is expected and harmless when the device has already gone — its forwards went with it.
 *
 * @param {import('./emulator.mjs').DeviceTools['adb']} adb
 * @param {string} serial
 * @param {readonly number[]} ports
 * @returns {number[]}
 */
export function unreversePorts(adb, serial, ports) {
  return ports.filter(
    (port) => adb(['-s', serial, 'reverse', '--remove', `tcp:${String(port)}`]).code !== 0,
  );
}

/**
 * Gives a device back, and says what became of it: an emulator of the run goes down, a device that
 * was attached before the run stays as it was.
 *
 * @param {import('./emulator.mjs').Device} device
 * @param {import('./emulator.mjs').DeviceTools} tools
 * @returns {Promise<'kept' | 'stopped' | 'killed'>}
 */
export async function giveDeviceBack(device, tools) {
  const released = await releaseDevice(device, tools);

  if (released === 'kept') {
    ok('device left as it was', `${device.serial} was attached before the run`);
  } else {
    ok(
      'emulator down',
      released === 'killed' ? 'it ignored emu kill, so it was killed' : device.serial,
    );
  }

  return released;
}

/**
 * Stops the Gradle daemons a build of the app left behind, and says so.
 *
 * Its own process group: a second Ctrl+C typed while the teardown runs would otherwise interrupt
 * the very command that frees those gigabytes.
 *
 * @param {{ host?: Host, wrapper?: string }} [options]
 * @returns {'absent' | 'stopped' | 'failed'} `absent` when Flutter never wrote a wrapper, so no
 *   build ever ran and there is no daemon to stop
 */
export function stopGradleDaemons(options = {}) {
  const host = options.host ?? realHost;
  const wrapper = options.wrapper ?? GRADLE_WRAPPER;

  if (!host.exists(wrapper)) {
    return 'absent';
  }

  const stopped = host.run(wrapper, ['--stop'], {
    cwd: path.dirname(wrapper),
    timeoutMs: 60_000,
    ownProcessGroup: true,
  });

  if (stopped.code !== 0) {
    warn('gradlew --stop did not exit cleanly', `exit ${String(stopped.code)}`);
    return 'failed';
  }

  ok('Gradle daemons stopped');
  return 'stopped';
}
