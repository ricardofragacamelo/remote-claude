/**
 * What `pnpm dev:mobile` compiles the app with, and which ports of this machine the device needs.
 *
 * The app has no `.env` at runtime: every address is a `--dart-define`, baked into the build. The
 * values come from the repository `.env` — the same file `pnpm dev` started the stack from — so
 * the app talks to the stack that is actually running, and not to whatever a hand-written command
 * line remembered.
 *
 * The app talks through **one origin** (plan 10, D-13, D-16): the web server of `pnpm dev`, which
 * forwards the API, the socket and the login — the internal address, `http://localhost:<web port>`,
 * that `adb reverse` makes reach this machine from inside the device. The backend accepts the login
 * of that origin beside the direct one (ADR-021). The external address is the `.env`'s
 * `RC_EXTERNAL_URL`, when the developer has one; empty, its radio is off (D-12).
 */

import { MOBILE_REDIRECT_URL, defineArgs, resolvePorts, webOrigin } from './stack.mjs';

/** The Android application id, as `mobile/android/app/build.gradle.kts` declares it. */
export const ANDROID_PACKAGE = 'com.remoteclaude.remote_claude';

/** The version reported when `pubspec.yaml` declares none. */
export const FALLBACK_APP_VERSION = '0.0.0';

/** Hosts that mean "this machine" — the ones `adb reverse` has to carry into the device. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The variables of the repository `.env` the app's login needs, and the define each becomes. */
const OIDC_DEFINES = {
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
  const oidc = oidcDefines(env, problems);
  const realmPath = realmPathOf(env, problems);

  let web = '';
  try {
    web = webOrigin(resolvePorts(env).web);
  } catch (error) {
    problems.push(/** @type {Error} */ (error).message);
  }

  if (problems.length > 0) {
    return { problems };
  }

  return {
    defines: {
      RC_INTERNAL_URL: (env['RC_INTERNAL_URL'] ?? '').trim() || web,
      RC_EXTERNAL_URL: (env['RC_EXTERNAL_URL'] ?? '').trim(),
      RC_OIDC_REALM_PATH: realmPath,
      ...oidc,
      RC_OIDC_REDIRECT_URL: MOBILE_REDIRECT_URL,
      RC_APP_VERSION: appVersion,
    },
  };
}

/**
 * The login's fixed values the `.env` names, adding to [problems] each one it lacks.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} problems
 * @returns {Record<string, string>}
 */
function oidcDefines(env, problems) {
  /** @type {Record<string, string>} */
  const oidc = {};
  for (const [define, variable] of Object.entries(OIDC_DEFINES)) {
    const value = (env[variable] ?? '').trim();
    if (value === '') {
      problems.push(`${variable} is not set in the .env`);
    }
    oidc[define] = value;
  }
  return oidc;
}

/**
 * Where the realm sits on any origin — the path of the `.env`'s issuer, without a trailing slash —
 * adding to [problems] when there is no issuer to read it from.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} problems
 * @returns {string}
 */
function realmPathOf(env, problems) {
  const issuer = (env['OIDC_ISSUER'] ?? '').trim();
  const realm = urlOrNull(issuer);

  if (issuer === '') {
    problems.push('OIDC_ISSUER is not set in the .env');
  } else if (realm === null) {
    problems.push(`OIDC_ISSUER is not a URL: "${issuer}"`);
  }

  return realm === null ? '' : realm.pathname.replace(/\/+$/, '');
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
 * The ports of this machine the device has to reach: those of the addresses the app is built with.
 *
 * Only addresses on this machine are forwarded. An origin on another host — a tunnel, a server on
 * the network — is reached by the device directly, and a forward would point its port at the wrong
 * machine.
 *
 * @param {Record<string, string>} defines what {@link localDefines} answered
 * @returns {number[]} without repetitions, in the order the app uses them
 */
export function forwardedPorts(defines) {
  const ports = [defines['RC_INTERNAL_URL'], defines['RC_EXTERNAL_URL']]
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
