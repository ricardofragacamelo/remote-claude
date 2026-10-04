/**
 * What `pnpm mobile:install` builds the app with, and which phone it installs it on.
 *
 * The app is installed for good, and used without the cable: its internal address is this machine on
 * the local network, and its external one the origin `pnpm dev:public` publishes (plan 10, D-22).
 * What the `.env` writes wins over what is found, and every address keeps where it came from, so the
 * console can say it.
 */

import { ANDROID_PACKAGE } from './mobile-local.mjs';
import { ORIGIN_REFUSALS, PUBLIC_URL_VARIABLE, parsePublicOrigin } from './public-url.mjs';
import { defineArgs, lanOrigin, resolvePorts } from './stack.mjs';

/** The APK `flutter build apk --debug` writes, relative to `mobile/`. */
export const DEBUG_APK = 'build/app/outputs/flutter-apk/app-debug.apk';

/** The usage line, for the refusal of an argument. */
export const USAGE = 'usage: `pnpm mobile:install [-- --device <serial>] [--dry-run]`';

/**
 * @typedef {{ url: string, source: string }} Address an origin — empty when there is none — and
 *   where it came from
 */

/**
 * Reads `--dry-run` and `--device <serial>`. A leading `--` is the separator of
 * `pnpm mobile:install -- …`, which some versions of pnpm pass through.
 *
 * @param {readonly string[]} argv the arguments after the script name
 * @returns {{ ok: true, dryRun: boolean, device: string | null } | { ok: false, message: string }}
 */
export function parseInstallArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  let dryRun = false;
  /** @type {string | null} */
  let device = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--device' && next !== undefined && !next.startsWith('-')) {
      device = next;
      index += 1;
    } else {
      return { ok: false, message: `unknown argument: ${String(arg)}` };
    }
  }

  return { ok: true, dryRun, device };
}

/**
 * The internal address: the `.env`'s `RC_INTERNAL_URL`, else the web dev server on this machine's
 * address on the local network, else none.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ address: string | null, source: string }} lan
 * @returns {Address}
 */
function internalAddress(env, lan) {
  const written = (env['RC_INTERNAL_URL'] ?? '').trim();

  if (written !== '') {
    return { url: written, source: 'RC_INTERNAL_URL in .env' };
  }

  if (lan.address === null) {
    return { url: '', source: 'no local network address' };
  }

  return {
    url: lanOrigin(lan.address, resolvePorts(env).web),
    source: `local network — ${lan.source}`,
  };
}

/**
 * The external address: the first of `RC_EXTERNAL_URL`, `RC_PUBLIC_URL` and the origin the last
 * `pnpm dev:public` opened — each an https origin, or a refusal naming where it came from.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ origin: string | null, file: string }} recorded
 * @returns {{ address: Address } | { problem: string }}
 */
function externalAddress(env, recorded) {
  const candidates = [
    { value: env['RC_EXTERNAL_URL'], source: 'RC_EXTERNAL_URL in .env' },
    { value: env[PUBLIC_URL_VARIABLE], source: `${PUBLIC_URL_VARIABLE} in .env` },
    { value: recorded.origin ?? undefined, source: `last \`pnpm dev:public\` (${recorded.file})` },
  ];
  const chosen = candidates.find((candidate) => (candidate.value ?? '').trim() !== '');

  if (chosen === undefined) {
    return {
      address: { url: '', source: 'none — run `pnpm dev:public` once, or set RC_PUBLIC_URL' },
    };
  }

  const parsed = parsePublicOrigin(String(chosen.value));
  if (!parsed.ok) {
    return {
      problem: `${chosen.source}: "${String(chosen.value).trim()}" ${ORIGIN_REFUSALS[parsed.reason]}`,
    };
  }

  return { address: { url: parsed.origin, source: chosen.source } };
}

/**
 * Both addresses the app is built with, or every reason there cannot be a build.
 *
 * @param {NodeJS.ProcessEnv} env the repository `.env`, already loaded
 * @param {{ lan: { address: string | null, source: string },
 *           recorded: { origin: string | null, file: string } }} found
 * @returns {{ internal: Address, external: Address } | { problems: string[] }}
 */
export function installAddresses(env, found) {
  /** @type {string[]} */
  const problems = [];

  /** @type {Address} */
  let internal = { url: '', source: '' };
  try {
    internal = internalAddress(env, found.lan);
  } catch (error) {
    problems.push(/** @type {Error} */ (error).message);
  }

  const external = externalAddress(env, found.recorded);
  if ('problem' in external) {
    problems.push(external.problem);
  }

  if (problems.length > 0) {
    return { problems };
  }

  const externalUrl = /** @type {{ address: Address }} */ (external).address;
  if (internal.url === '' && externalUrl.url === '') {
    return {
      problems: [
        'no address to build the app with: no local network address and no public origin',
        'connect this machine to the network (or set RC_LAN_ADDRESS), or run `pnpm dev:public` once',
      ],
    };
  }

  return { internal, external: externalUrl };
}

/**
 * @typedef {{ serial: string, state: string, model: string }} UsbDevice
 */

/**
 * The phones `adb devices -l` lists on USB, in whatever state. An emulator, and a phone over
 * network `adb`, carry no `usb:` and are left out: neither is the phone in the cable.
 *
 * @param {string} output what `adb devices -l` printed
 * @returns {UsbDevice[]}
 */
export function usbDevices(output) {
  return output
    .split('\n')
    .map((row) => row.trim().split(/\s+/))
    .filter(
      ([serial, , ...properties]) =>
        serial !== undefined && properties.some((p) => p.startsWith('usb:')),
    )
    .map(([serial, state, ...properties]) => ({
      serial: String(serial),
      state: String(state),
      model:
        properties.find((p) => p.startsWith('model:'))?.slice('model:'.length) ?? 'unknown model',
    }));
}

/** What to do about a phone `adb` lists but cannot use, by its state. */
const STATE_HINTS = {
  unauthorized: 'accept the "Allow USB debugging?" prompt on the phone, then run this again',
  offline: 'unplug and plug the cable again; `adb kill-server` if it stays offline',
  'no permissions':
    'the udev rules do not let this user reach the phone (https://developer.android.com/studio/run/device)',
};

/**
 * The phone to install on, or why there is none.
 *
 * @param {UsbDevice[]} devices
 * @param {string | null} requested the serial of `--device`
 * @returns {{ device: UsbDevice } | { problem: string, hint: string }}
 */
export function pickDevice(devices, requested) {
  const listed = devices
    .map((device) => `${device.serial} (${device.model}, ${device.state})`)
    .join(', ');
  const candidates = requested === null ? devices : devices.filter((d) => d.serial === requested);

  if (requested !== null && candidates.length === 0) {
    return {
      problem: `--device ${requested} is not on USB`,
      hint: listed === '' ? 'no phone is on USB at all' : `on USB: ${listed}`,
    };
  }

  const ready = candidates.filter((device) => device.state === 'device');

  if (ready.length === 1) {
    return { device: /** @type {UsbDevice} */ (ready[0]) };
  }

  if (ready.length > 1) {
    return {
      problem: 'more than one phone on USB',
      hint: `choose one with --device <serial>: ${listed}`,
    };
  }

  const stuck = candidates[0];
  if (stuck === undefined) {
    return {
      problem: 'no phone on USB',
      hint: 'plug it in, turn on USB debugging (Developer options), and accept the prompt on the phone',
    };
  }

  return {
    problem: `${stuck.serial} is ${stuck.state}`,
    hint:
      STATE_HINTS[/** @type {keyof typeof STATE_HINTS} */ (stuck.state)] ??
      `\`adb devices -l\` says: ${listed}`,
  };
}

/**
 * The arguments of `flutter build` for the debug APK, with the defines baked in (D-21).
 *
 * @param {Record<string, string>} defines
 * @returns {string[]}
 */
export function flutterBuildArgs(defines) {
  return ['build', 'apk', '--debug', ...defineArgs(defines)];
}

/**
 * What to do about a failed `adb install`, from what it printed — or `null` when it is nothing this
 * script knows better than the output itself.
 *
 * @param {string} output stdout and stderr of `adb install`
 * @param {string} serial
 * @returns {string | null}
 */
export function installFailureHint(output, serial) {
  if (output.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
    return `the phone has the app signed by another key; \`adb -s ${serial} uninstall ${ANDROID_PACKAGE}\` removes it — and its login and saved address — then run this again`;
  }

  if (output.includes('INSTALL_FAILED_USER_RESTRICTED')) {
    return 'the phone refused the install: turn on "Install via USB" in Developer options';
  }

  if (output.includes('INSTALL_FAILED_INSUFFICIENT_STORAGE')) {
    return 'the phone is out of space';
  }

  return null;
}

/**
 * @typedef {object} InstallTools the two commands that touch the build and the phone, handed in so
 *   every branch is tested without either
 * @property {(args: string[]) => import('./exec.mjs').RunResult} flutter
 * @property {(args: string[]) => import('./exec.mjs').RunResult} adb
 */

/**
 * @typedef {{ installed: true } | { problem: string, detail: string, hint: string | null }} InstallOutcome
 */

/**
 * Builds the debug APK and installs it on [serial], replacing the app there with its data kept —
 * so running it again installs again, and the login and the saved address survive.
 *
 * @param {InstallTools} tools
 * @param {string} serial
 * @param {Record<string, string>} defines
 * @param {string} apk absolute path of what the build writes
 * @returns {InstallOutcome}
 */
export function buildAndInstall(tools, serial, defines, apk) {
  const built = tools.flutter(flutterBuildArgs(defines));
  if (built.code !== 0) {
    return {
      problem: 'the build failed',
      detail: `exit ${String(built.code)} — the output above says why`,
      hint: null,
    };
  }

  const installed = tools.adb(['-s', serial, 'install', '-r', apk]);
  if (installed.code !== 0) {
    const output = `${installed.stdout}\n${installed.stderr}`.trim();
    return {
      problem: 'adb install failed',
      detail: output.split('\n').at(-1) ?? '',
      hint: installFailureHint(output, serial),
    };
  }

  return { installed: true };
}
