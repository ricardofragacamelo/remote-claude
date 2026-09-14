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
