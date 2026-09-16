/**
 * What the local stack is made of: its compose project name, its ports, and the URLs those
 * ports produce.
 *
 * `start-local` and `run-e2e-local` differ in exactly one thing — the first uses the fixed ports
 * of docs/plans/00-bootstrap/README.md#portas, the second allocates random ones. Everything
 * downstream of that choice is the same, so it is described once, here, as a pure function of
 * the ports.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Compose project of the development stack. Ephemeral e2e runs use `<this>-e2e-<id>`. */
export const PROJECT_NAME = 'remote-claude';

/**
 * The compose project to act on.
 *
 * `COMPOSE_PROJECT_NAME` is Compose's own variable, honoured here rather than reinvented, and it
 * is what lets the suite bring up a throwaway copy of the stack without tearing down the
 * development one someone has running in another terminal.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
export function projectName(env) {
  const configured = env['COMPOSE_PROJECT_NAME']?.trim();
  return configured === undefined || configured === '' ? PROJECT_NAME : configured;
}

/** Prefix shared by every project this repository creates, and the scope of every purge. */
export const PROJECT_PREFIX = 'remote-claude';

/**
 * Prefix of every throwaway stack an e2e run creates.
 *
 * It is the scope of the purge `run-e2e-local` does before it starts: narrow enough that the
 * development project — named exactly `remote-claude`, with no suffix — can never match it, and
 * wide enough that a run killed with SIGKILL last week is still cleaned up today.
 */
export const E2E_PROJECT_PREFIX = `${PROJECT_NAME}-e2e-`;

/**
 * Compose project of one ephemeral run.
 *
 * Unique per execution, which is what lets the suite run with `pnpm dev` up in another terminal,
 * and two suites run side by side in CI.
 *
 * @param {number | string} id something unique to this run — an allocated port, typically
 * @returns {string}
 */
export function e2eProjectName(id) {
  return `${E2E_PROJECT_PREFIX}${String(id)}`;
}

/**
 * Credentials of the ephemeral database.
 *
 * Pinned rather than inherited from the developer's `.env`: compose reads that file on its own,
 * and a suite whose database name depends on who is running it is a suite that passes on one
 * machine and fails on another. They are the documented defaults of `.env.example`.
 */
export const E2E_POSTGRES = {
  user: 'remote_claude',
  password: 'remote_claude',
  db: 'remote_claude',
};

/**
 * @typedef {object} EphemeralEnvironment
 * @property {string} RC_POSTGRES_PORT
 * @property {string} RC_KEYCLOAK_PORT
 * @property {string} RC_BACKEND_PORT
 * @property {string} RC_WEB_PORT
 * @property {string} RC_POSTGRES_USER
 * @property {string} RC_POSTGRES_PASSWORD
 * @property {string} RC_POSTGRES_DB
 * @property {string} DATABASE_URL
 * @property {string} OIDC_ISSUER
 * @property {string} OIDC_AUDIENCE
 * @property {string} OIDC_CLIENT_ID_WEB
 * @property {string} OIDC_CLIENT_ID_MOBILE
 * @property {string} OIDC_SCOPES
 * @property {string} NODE_ENV
 * @property {string} LOG_LEVEL
 */

/**
 * The whole environment an ephemeral stack runs under.
 *
 * Everything downstream — compose, the backend, the Vite build, the browser — reads these and
 * nothing else, so the run is hermetic: no `.env` of the machine reaches it, and two runs on the
 * same machine share no port, no project and no volume.
 *
 * The named type above is not decoration: as a bare `Record<string, string>` every read of it
 * would be `string | undefined`, and the `?? ''` that silences that is a branch nothing can ever
 * take — an unreachable branch in the coverage report is a lie about what was tested.
 *
 * @param {StackPorts} ports
 * @returns {EphemeralEnvironment}
 */
export function ephemeralEnvironment(ports) {
  const urls = serviceUrls(ports);

  return {
    RC_POSTGRES_PORT: String(ports.postgres),
    RC_KEYCLOAK_PORT: String(ports.keycloak),
    RC_BACKEND_PORT: String(ports.backend),
    RC_WEB_PORT: String(ports.web),

    RC_POSTGRES_USER: E2E_POSTGRES.user,
    RC_POSTGRES_PASSWORD: E2E_POSTGRES.password,
    RC_POSTGRES_DB: E2E_POSTGRES.db,
    DATABASE_URL: `postgresql://${E2E_POSTGRES.user}:${E2E_POSTGRES.password}@${urls.postgres}/${E2E_POSTGRES.db}`,

    OIDC_ISSUER: urls.realm,
    OIDC_AUDIENCE: 'https://api.remote-claude.local',
    OIDC_CLIENT_ID_WEB: 'remote-claude-web',
    OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
    OIDC_SCOPES: 'openid profile email offline_access',

    NODE_ENV: 'test',
    LOG_LEVEL: 'debug',
  };
}

/**
 * The `.env` the Playwright process reads, as text.
 *
 * Written by `run-e2e-local` and deleted by it, so the suite never has to be told where the stack
 * of this particular run ended up. It is a generated file: a stale copy is worse than none, which
 * is why the cleanup removes it even when the run failed.
 *
 * @param {StackPorts} ports
 * @returns {string}
 */
export function e2eDotEnv(ports) {
  const urls = serviceUrls(ports);
  const environment = ephemeralEnvironment(ports);

  /** @type {Record<string, string>} */
  const values = {
    RC_WEB_URL: urls.web,
    RC_BACKEND_URL: urls.backend,
    RC_WS_URL: `${urls.backend.replace(/^http/, 'ws')}/ws`,
    RC_KEYCLOAK_URL: urls.keycloak,
    RC_OIDC_ISSUER: urls.realm,
    RC_OIDC_CLIENT_ID: environment.OIDC_CLIENT_ID_WEB,

    // The Flutter end reads the same file, and needs the two values the browser does not.
    RC_OIDC_CLIENT_ID_MOBILE: environment.OIDC_CLIENT_ID_MOBILE,
    RC_OIDC_SCOPES: environment.OIDC_SCOPES,
  };

  const body = Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');

  return `# Written by scripts/run-e2e-local.mjs, and deleted when the run ends. Never commit it.\n${body}\n`;
}

/** Services declared in docker-compose.yml, in start order. */
export const SERVICES = ['postgres', 'keycloak'];

/** Realm imported from infra/keycloak/realm-remote-claude.json. */
export const REALM = 'remote-claude';

/** The fixed ports, and the variable that moves each one. Mirrors .env.example. */
export const PORT_VARIABLES = [
  { key: 'postgres', variable: 'RC_POSTGRES_PORT', fallback: 5432 },
  { key: 'keycloak', variable: 'RC_KEYCLOAK_PORT', fallback: 8180 },
  { key: 'backend', variable: 'RC_BACKEND_PORT', fallback: 3000 },
  { key: 'web', variable: 'RC_WEB_PORT', fallback: 5173 },
];

/**
 * @typedef {{ postgres: number, keycloak: number, backend: number, web: number }} StackPorts
 */

/**
 * The ports of the development stack, as the environment sets them.
 *
 * A variable holding something that is not a port is an error, not a reason to fall back to the
 * default: silently ignoring `RC_WEB_PORT=nope` and binding 5173 is how someone spends an hour
 * wondering why their setting has no effect.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {StackPorts}
 * @throws {Error} when a variable is set to something that is not a valid port
 */
export function resolvePorts(env) {
  /** @type {Record<string, number>} */
  const ports = {};

  for (const { key, variable, fallback } of PORT_VARIABLES) {
    const raw = env[variable];

    if (raw === undefined || raw.trim() === '') {
      ports[key] = fallback;
      continue;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 65_535) {
      throw new Error(`${variable}="${raw}" is not a valid TCP port`);
    }

    ports[key] = value;
  }

  return /** @type {StackPorts} */ (/** @type {unknown} */ (ports));
}

/**
 * Where each part of the stack answers.
 *
 * @param {StackPorts} ports
 * @returns {{ postgres: string, keycloak: string, realm: string, discovery: string,
 *            backend: string, web: string }}
 */
export function serviceUrls(ports) {
  const keycloak = `http://localhost:${String(ports.keycloak)}`;
  const realm = `${keycloak}/realms/${REALM}`;

  return {
    postgres: `localhost:${String(ports.postgres)}`,
    keycloak,
    realm,
    discovery: `${realm}/.well-known/openid-configuration`,
    backend: `http://localhost:${String(ports.backend)}`,
    web: `http://localhost:${String(ports.web)}`,
  };
}

/**
 * Loads `.env` into `process.env`, if it exists.
 *
 * Compose reads `.env` on its own; node does not. Without this the script would print 5432 in
 * the URL board while compose published the port the file asks for.
 *
 * @param {string} rootDir
 * @returns {boolean} whether a file was loaded
 */
export function loadDotEnv(rootDir) {
  const file = path.join(rootDir, '.env');
  if (!fs.existsSync(file)) {
    return false;
  }

  process.loadEnvFile(file);
  return true;
}

/**
 * A workspace that can be started in watch mode, or the reason it cannot.
 *
 * The backend and the web front arrive in later phases of the bootstrap plan (F3 and F4). Until
 * they do, `pnpm dev` still has a job — the infrastructure half — and says which halves are not
 * built yet instead of failing on a missing directory.
 *
 * @param {string} rootDir
 * @param {string} workspace
 * @returns {{ ready: boolean, reason?: string }}
 */
export function workspaceStatus(rootDir, workspace) {
  const manifest = path.join(rootDir, workspace, 'package.json');

  if (!fs.existsSync(manifest)) {
    return { ready: false, reason: 'not created yet' };
  }

  const parsed = /** @type {{ scripts?: Record<string, string> }} */ (
    JSON.parse(fs.readFileSync(manifest, 'utf8'))
  );

  return parsed.scripts?.['dev'] === undefined
    ? { ready: false, reason: 'has no `dev` script' }
    : { ready: true };
}

/** Deep link the provider sends the mobile app back to, as the realm registers it. */
export const MOBILE_REDIRECT_URL = 'br.com.remoteclaude.app://oauth/callback';

/**
 * The `--dart-define` arguments the Flutter end-to-end run is compiled with.
 *
 * Flutter has no `.env` at runtime: a value that is not compiled in does not exist on the device.
 * The scenario travels the same way and for the same reason — on a real device there is no
 * repository to read `e2e/scenarios/` from, so the runner reads it here and compiles it in.
 *
 * @param {Record<string, string>} env the values of `e2e/.env`, already loaded
 * @param {string} scenario the shared scenario, as JSON
 * @param {string} appVersion reported in the handshake and in every log line
 * @returns {string[]}
 */
export function dartDefines(env, scenario, appVersion) {
  /** @type {Record<string, string>} */
  const defines = {
    RC_API_URL: env['RC_BACKEND_URL'] ?? '',
    RC_WS_URL: env['RC_WS_URL'] ?? '',
    RC_OIDC_ISSUER: env['RC_OIDC_ISSUER'] ?? '',
    RC_OIDC_CLIENT_ID: env['RC_OIDC_CLIENT_ID_MOBILE'] ?? '',
    RC_OIDC_SCOPES: env['RC_OIDC_SCOPES'] ?? '',
    RC_OIDC_REDIRECT_URL: MOBILE_REDIRECT_URL,
    RC_APP_VERSION: appVersion,
    RC_SCENARIO: scenario,
  };

  return Object.entries(defines).flatMap(([name, value]) => ['--dart-define', `${name}=${value}`]);
}
