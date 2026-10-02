/**
 * What `pnpm dev:mobile` compiles the app with, and which ports of this machine the device needs.
 *
 * The app has no `.env` at runtime: every address is a `--dart-define`, baked into the build. The
 * values come from the repository `.env` — the same file `pnpm dev` started the stack from — so
 * the app talks to the stack that is actually running, and not to whatever a hand-written command
 * line remembered.
 *
 * The addresses stay `localhost`, and `adb reverse` makes them reach this machine from inside the
 * device. Rewriting them to `10.0.2.2` would work for the API and break the login: the issuer in
 * the token has to be the one the backend was configured with, byte for byte.
 */

import { MOBILE_REDIRECT_URL, WS_PATH, defineArgs, resolvePorts, serviceUrls } from './stack.mjs';

/** The Android application id, as `mobile/android/app/build.gradle.kts` declares it. */
export const ANDROID_PACKAGE = 'com.remoteclaude.remote_claude';

/** The version reported when `pubspec.yaml` declares none. */
export const FALLBACK_APP_VERSION = '0.0.0';

/** Hosts that mean "this machine" — the ones `adb reverse` has to carry into the device. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The variables of the repository `.env` the app's login needs, and the define each becomes. */
const OIDC_DEFINES = {
  RC_OIDC_ISSUER: 'OIDC_ISSUER',
  RC_OIDC_CLIENT_ID: 'OIDC_CLIENT_ID_MOBILE',
  RC_OIDC_SCOPES: 'OIDC_SCOPES',
};

/**
 * The version `pubspec.yaml` declares, which the app reports in the handshake and in its logs.
 *
 * @param {string} pubspec the contents of `mobile/pubspec.yaml`
 * @returns {string}
 */
export function pubspecVersion(pubspec) {
  return /^version:\s*(\S+)/m.exec(pubspec)?.[1] ?? FALLBACK_APP_VERSION;
}

/**
 * A URL, or `null` when the text is not one.
 *
 * @param {string | undefined} raw
 * @returns {URL | null}
 */
function urlOrNull(raw) {
  try {
    return new URL(raw ?? '');
  } catch {
    // Not a URL: the caller decides whether that is a problem of the `.env`, and names it.
    return null;
  }
}

/**
 * The defines of a local build, or every reason there cannot be one.
 *
 * Every problem at once, as the backend and the app do with theirs: a build is minutes, and
 * finding the second missing variable only after fixing the first is minutes twice.
 *
 * @param {NodeJS.ProcessEnv} env the repository `.env`, already loaded
 * @param {string} appVersion
 * @returns {{ defines: Record<string, string> } | { problems: string[] }}
 */
export function localDefines(env, appVersion) {
  /** @type {string[]} */
  const problems = [];

  /** @type {Record<string, string>} */
  const oidc = {};
  for (const [define, variable] of Object.entries(OIDC_DEFINES)) {
    const value = (env[variable] ?? '').trim();
    if (value === '') {
      problems.push(`${variable} is not set in the .env`);
    }
    oidc[define] = value;
  }

  if (oidc['RC_OIDC_ISSUER'] !== '' && urlOrNull(oidc['RC_OIDC_ISSUER']) === null) {
    problems.push(`OIDC_ISSUER is not a URL: "${String(oidc['RC_OIDC_ISSUER'])}"`);
  }

  let backend = '';
  try {
    backend = serviceUrls(resolvePorts(env)).backend;
  } catch (error) {
    problems.push(/** @type {Error} */ (error).message);
  }

  if (problems.length > 0) {
    return { problems };
  }

  return {
    defines: {
      RC_API_URL: backend,
      RC_WS_URL: `${backend.replace(/^http/, 'ws')}${WS_PATH}`,
      ...oidc,
      RC_OIDC_REDIRECT_URL: MOBILE_REDIRECT_URL,
      RC_APP_VERSION: appVersion,
    },
  };
}

/**
 * The port a URL addresses, the scheme's default when it names none.
 *
 * @param {URL} url
 * @returns {number}
 */
function portOf(url) {
  if (url.port !== '') {
    return Number(url.port);
  }

  return url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80;
}

/**
 * The ports of this machine the device has to reach: the API's, and the issuer's.
 *
 * Only addresses on this machine are forwarded. An issuer on another host — a provider in the
 * cloud, a server on the network — is reached by the device directly, and a forward would point
 * its port at the wrong machine.
 *
 * @param {Record<string, string>} defines what {@link localDefines} answered
 * @returns {number[]} without repetitions, in the order the app uses them
 */
export function forwardedPorts(defines) {
  const ports = [defines['RC_API_URL'], defines['RC_OIDC_ISSUER']]
    .map((raw) => urlOrNull(raw))
    .filter((url) => url !== null && LOOPBACK_HOSTS.has(url.hostname))
    .map((url) => portOf(/** @type {URL} */ (url)));

  return [...new Set(ports)];
}

/**
 * The arguments of `flutter run` for this build, on this device.
 *
 * What the person typed after the command goes last, so a `--release` or a `--flavor` of theirs
 * is passed on as it is. A leading `--` is the separator of `pnpm dev:mobile -- …`, which some
 * versions of pnpm pass through; Flutter would read it as the end of its own options.
 *
 * @param {string} serial the device, as `adb` names it
 * @param {Record<string, string>} defines
 * @param {readonly string[]} [extra]
 * @returns {string[]}
 */
export function flutterRunArgs(serial, defines, extra = []) {
  const passed = extra[0] === '--' ? extra.slice(1) : extra;
  return ['run', '-d', serial, ...defineArgs(defines), ...passed];
}
