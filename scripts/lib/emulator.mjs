/**
 * The device a device suite runs on: the one already attached, or an emulator this run starts —
 * and then takes down again.
 *
 * **Whoever started it stops it.** An emulator somebody left running is theirs: the run uses it
 * and leaves it up. One the run started is the run's: it goes down in the teardown, on success,
 * on failure and on Ctrl+C alike. An emulator that outlives the run holds ~4 GB of memory and
 * four cores until somebody notices, which on a developer machine is the next time it freezes.
 *
 * The calls into `adb` and the emulator are handed in, so every branch here is tested without a
 * device; `scripts/run-e2e-local.mjs` is what wires the real ones.
 */

import path from 'node:path';

import { processAbort, waitUntil } from './wait.mjs';

/** The dedicated AVD of the suite (README, Testes). */
export const EMULATOR_AVD = 'remote_claude_api35';

/**
 * The console port the run starts its emulator on, which fixes its `adb` serial.
 *
 * The emulator is only started when no device is attached at all, so the first port is free
 * unless something outside `adb` holds it — and then the emulator exits, and the wait says so.
 */
export const EMULATOR_PORT = 5554;

/** How long a cold boot gets. Measured at ~70 s on a warm quickboot snapshot, ~3 min cold. */
export const BOOT_TIMEOUT_MS = 300_000;

/** How long `adb emu kill` gets before the process group is killed outright. */
export const SHUTDOWN_TIMEOUT_MS = 60_000;

/**
 * Where the Android SDK lives: what the environment says, or the platform's default location.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} home
 * @param {NodeJS.Platform} platform
 * @returns {string}
 */
export function androidSdkRoot(env, home, platform) {
  const declared = env['ANDROID_HOME'] ?? env['ANDROID_SDK_ROOT'];
  if (declared !== undefined && declared !== '') {
    return declared;
  }

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Android', 'sdk');
  }

  if (platform === 'win32') {
    return path.join(home, 'AppData', 'Local', 'Android', 'Sdk');
  }

  return path.join(home, 'Android', 'Sdk');
}

/**
 * The two SDK folders the device suites need on PATH.
 *
 * @param {string} sdkRoot
 * @returns {string[]}
 */
function sdkToolDirs(sdkRoot) {
  return [path.join(sdkRoot, 'platform-tools'), path.join(sdkRoot, 'emulator')];
}

/**
 * The environment with `adb` and `emulator` reachable, whatever the shell's PATH says.
 *
 * The SDK installer does not touch PATH, so on most machines `adb` is simply not there — and the
 * device suite, which calls it by name, would fail on a machine that has everything installed.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} sdkRoot
 * @param {string} [delimiter]
 * @returns {NodeJS.ProcessEnv}
 */
export function withSdkOnPath(env, sdkRoot, delimiter = path.delimiter) {
  const current = env['PATH'] ?? '';
  const dirs = sdkToolDirs(sdkRoot).join(delimiter);

  return { ...env, PATH: current === '' ? dirs : `${dirs}${delimiter}${current}` };
}

/**
 * The serials `adb devices` lists, in whatever state — a device still booting counts as attached.
 *
 * @param {string} output what `adb devices` printed
 * @returns {string[]}
 */
export function attachedDevices(output) {
  return output
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row !== '' && !row.startsWith('List of devices') && !row.startsWith('*'))
    .map((row) => row.replace(/\s.*$/, ''));
}

/**
 * The command that starts the suite's emulator.
 *
 * Headless and with the limits of docs/plans/00-bootstrap/F6-scripts-e2e.md: no window, no audio,
 * 2 GB and four cores, and no snapshot written on the way out — the next run boots from the same
 * state, and the shutdown does not spend a minute saving one. With `systemd-run` present it runs
 * inside a cgroup with a hard memory ceiling, so a runaway emulator cannot take the machine down.
 *
 * @param {{ avd: string, port: number, fenced: boolean }} options
 * @returns {{ command: string, args: string[] }}
 */
export function emulatorCommand(options) {
  const flags = [
    '-avd',
    options.avd,
    '-port',
    String(options.port),
    '-no-window',
    '-no-audio',
    '-no-boot-anim',
    '-no-snapshot-save',
    '-gpu',
    'swiftshader_indirect',
    '-memory',
    '2048',
    '-cores',
    '4',
  ];

  if (!options.fenced) {
    return { command: 'emulator', args: flags };
  }

  return {
    command: 'systemd-run',
    args: [
      '--user',
      '--scope',
      '--quiet',
      `--unit=rc-emulator-${String(options.port)}`,
      '-p',
      'CPUQuota=400%',
      '-p',
      'MemoryMax=7G',
      'emulator',
      ...flags,
    ],
  };
}

/**
 * @typedef {object} Device
 * @property {string} serial what `adb -s` addresses it by
 * @property {import('node:child_process').ChildProcess | null} child the emulator this run
 *   started, or `null` for a device that was already attached — and is therefore not the run's
 *   to stop
 */

/**
 * @typedef {object} DeviceTools
 * @property {(args: readonly string[]) => import('./exec.mjs').RunResult} adb
 * @property {() => import('node:child_process').ChildProcess} startEmulator
 * @property {(child: import('node:child_process').ChildProcess) => Promise<void>} kill the whole
 *   process group, for an emulator that did not honour `emu kill`
 * @property {() => number} [now]
 * @property {(ms: number) => Promise<void>} [sleep]
 */

/**
 * The attached device, or a freshly started emulator when there is none.
 *
 * Synchronous on purpose: the caller keeps the answer before anything can throw, so a teardown
 * that runs halfway through the boot still knows there is an emulator to take down.
 *
 * @param {DeviceTools} tools
 * @param {{ avd?: string, port?: number }} [options]
 * @returns {{ device: Device } | { problem: string }}
 */
export function claimDevice(tools, options = {}) {
  const listed = tools.adb(['devices']);

  if (!listed.found) {
    return { problem: 'adb is not installed — set ANDROID_HOME to the Android SDK' };
  }

  if (listed.code !== 0) {
    return { problem: `adb devices failed: ${listed.stderr.trim()}` };
  }

  const attached = attachedDevices(listed.stdout)[0];
  if (attached !== undefined) {
    return { device: { serial: attached, child: null } };
  }

  const port = options.port ?? EMULATOR_PORT;
  return { device: { serial: `emulator-${String(port)}`, child: tools.startEmulator() } };
}

/**
 * Waits for the device to finish booting — `sys.boot_completed` is `1` — or for the emulator to
 * die trying.
 *
 * @param {Device} device
 * @param {DeviceTools} tools
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<void>}
 * @throws {import('./wait.mjs').WaitError}
 */
export function waitForBoot(device, tools, options = {}) {
  return waitUntil({
    target: `the device ${device.serial}`,
    abortIf: processAbort(device.child ?? undefined),
    probe: () => {
      const booted = tools.adb(['-s', device.serial, 'shell', 'getprop', 'sys.boot_completed']);
      return Promise.resolve(booted.code === 0 && booted.stdout.trim() === '1');
    },
    timeoutMs: options.timeoutMs ?? BOOT_TIMEOUT_MS,
    intervalMs: options.intervalMs ?? 2_000,
    ...(tools.now === undefined ? {} : { now: tools.now }),
    ...(tools.sleep === undefined ? {} : { sleep: tools.sleep }),
  });
}

/**
 * Takes down the emulator this run started, and leaves any other device alone.
 *
 * `emu kill` first — the emulator's own shutdown, which releases its lock files — and the process
 * group only when that did not end it in time.
 *
 * @param {Device} device
 * @param {DeviceTools} tools
 * @param {{ timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<'kept' | 'stopped' | 'killed'>}
 */
export async function releaseDevice(device, tools, options = {}) {
  const child = device.child;
  if (child === null) {
    return 'kept';
  }

  tools.adb(['-s', device.serial, 'emu', 'kill']);

  try {
    await waitUntil({
      target: `the emulator ${device.serial}`,
      probe: () => Promise.resolve(child.exitCode !== null || child.signalCode !== null),
      timeoutMs: options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS,
      intervalMs: options.intervalMs ?? 500,
      ...(tools.now === undefined ? {} : { now: tools.now }),
      ...(tools.sleep === undefined ? {} : { sleep: tools.sleep }),
    });
    return 'stopped';
  } catch {
    // The only way out of that wait is its deadline: the emulator ignored its own shutdown.
    await tools.kill(child);
    return 'killed';
  }
}
