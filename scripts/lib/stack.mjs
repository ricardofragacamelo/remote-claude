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
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { repoRoot } from './paths.mjs';
import { ALLOWLIST_FILE } from './workspaces.mjs';

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
 * **It carries the pid of the run that owns it** (plan 05, S-40). Every run purges what earlier
 * runs left behind before it starts, and a purge that went by the prefix alone would take down
 * the stack of a run still going beside it — a live run started while `verify:full` is in its e2e
 * gate, or two jobs on one self-hosted runner. With the owner in the name, "left
 * behind" means exactly what it says: owned by a process that is gone.
 *
 * @param {number | string} id something unique to this run — an allocated port, typically
 * @param {number} [ownerPid] the run that owns it
 * @returns {string}
 */
export function e2eProjectName(id, ownerPid = process.pid) {
  return `${E2E_PROJECT_PREFIX}${String(id)}-p${String(ownerPid)}`;
}

/**
 * The pid of the run that owns an e2e project, or `null` for a project that names none — one
 * created before projects carried their owner, which is left behind by definition.
 *
 * @param {string} project
 * @returns {number | null}
 */
export function projectOwner(project) {
  const match = /-p(\d+)$/.exec(project);
  return match === null ? null : Number(match[1]);
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
 * @property {string} RC_KEYCLOAK_ADMIN
 * @property {string} RC_KEYCLOAK_ADMIN_PASSWORD
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
 * @property {string} RC_WORKSPACE_ALLOWLIST_FILE
 * @property {string} RC_PID_FILE
 * @property {string} RC_SESSION_MAX_CONCURRENT
 * @property {string} RC_SESSION_MIN_CONCURRENT
 * @property {string} RC_SESSION_MEMORY_FRACTION
 * @property {string} RC_SESSION_MEMORY_MB
 * @property {string} RC_SESSION_IDLE_TTL_MS
 * @property {string} RC_WS_MAX_FRAMES_PER_SECOND
 * @property {string} RC_WS_MAX_FRAME_BYTES
 * @property {string} RC_WS_MAX_ATTACHED_SESSIONS
 * @property {string} RC_SESSION_MAX_TURNS
 * @property {string} RC_SESSION_MAX_BUDGET_USD
 * @property {string} RC_SESSION_DEFAULT_MODEL
 * @property {string} RC_SESSION_DEFAULT_PERMISSION_MODE
 * @property {string} RC_PERMISSION_TIMEOUT_MS
 * @property {string} RC_PERMISSION_EXTENSION_MS
 * @property {string} RC_PERMISSION_MAX_EXTENSIONS
 * @property {string} RC_PERMISSION_RULE_LIFETIME_MS
 * @property {string} RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS
 * @property {string} RC_PERMISSION_RULE_MAX_LIFETIME_MS
 * @property {string} RC_PUSH_ENDPOINT
 * @property {string} RC_PUSH_CREDENTIALS_FILE
 * @property {string} RC_PUSH_SCOPE
 * @property {string} RC_CHECKPOINT_DIR
 * @property {string} RC_CHECKPOINT_MAX_FILE_BYTES
 * @property {string} RC_CHECKPOINT_MAX_STORE_BYTES
 * @property {string} RC_AUDIT_RETENTION_DAYS
 * @property {string} RC_AUDIT_PURGE_INTERVAL_MS
 * @property {string} [CLAUDE_CONFIG_DIR]
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
 * @param {{ claudeConfigDir?: string | null }} [options] where the CLI keeps its configuration.
 *   The hermetic run isolates it, so a test never edits somebody's own editor. `null` leaves the
 *   variable **unset**, which is what the live run needs: the login lives in the CLI's own default
 *   layout, and pointing the variable anywhere at all moves the place it looks for it.
 * @returns {EphemeralEnvironment}
 */
export function ephemeralEnvironment(ports, options = {}) {
  const urls = serviceUrls(ports);

  return {
    RC_POSTGRES_PORT: String(ports.postgres),
    RC_KEYCLOAK_PORT: String(ports.keycloak),
    RC_BACKEND_PORT: String(ports.backend),
    RC_WEB_PORT: String(ports.web),

    RC_KEYCLOAK_ADMIN: E2E_KEYCLOAK_ADMIN.username,
    RC_KEYCLOAK_ADMIN_PASSWORD: E2E_KEYCLOAK_ADMIN.password,

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

    // Absolute, because the backend is started with its own package as the working directory and
    // a relative path would resolve against that instead of against the repository.
    RC_WORKSPACE_ALLOWLIST_FILE: ALLOWLIST_FILE,
    // Off: `pnpm allowlist` signals the backend of `pnpm dev` by its pid file, and a test stack
    // never writes one it could find — what a developer frees on their machine never reaches a
    // run (plan 06, S-59).
    RC_PID_FILE: 'off',

    RC_SESSION_MAX_CONCURRENT: '10',
    RC_SESSION_MIN_CONCURRENT: '1',
    RC_SESSION_MEMORY_FRACTION: '0.5',
    RC_SESSION_MEMORY_MB: '256',
    RC_SESSION_IDLE_TTL_MS: '1800000',
    RC_SESSION_MAX_TURNS: '100',
    RC_SESSION_MAX_BUDGET_USD: '10',
    RC_SESSION_DEFAULT_MODEL: 'claude-sonnet-5',
    RC_SESSION_DEFAULT_PERMISSION_MODE: 'default',

    // High on purpose: three scenarios overflow a 1,000-event replay buffer by sending frames, and
    // at the product's 20 a second that alone would be most of a minute each. The client of the
    // suite still paces itself by what `connection.ready` announces; a scenario about the rate limit
    // itself sets its own number (plan 05, B-06).
    RC_WS_MAX_FRAMES_PER_SECOND: '5000',
    RC_WS_MAX_FRAME_BYTES: '65536',
    RC_WS_MAX_ATTACHED_SESSIONS: '16',

    // Short, because an e2e that waits two minutes for a permission to expire is an e2e nobody
    // runs. The scenario that needs the deadline to pass says so; the others answer long before.
    RC_PERMISSION_TIMEOUT_MS: '5000',
    RC_PERMISSION_EXTENSION_MS: '10000',
    RC_PERMISSION_MAX_EXTENSIONS: '2',
    RC_PERMISSION_RULE_LIFETIME_MS: '600000',
    RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS: '3600000',
    RC_PERMISSION_RULE_MAX_LIFETIME_MS: '86400000',

    // The CLI's configuration — the trust marks among it, and the login. The hermetic run keeps
    // it away from the developer's own, because the backend clears a directory's trust mark
    // before opening a session there and a run that did that to somebody's real `~/.claude.json`
    // would be a test editing their editor.
    //
    // The **live** run passes `null` and the variable is left out entirely. Setting it to
    // anything — even to the home directory — moves where the CLI looks for the login, and a CLI
    // that cannot find it answers "Not logged in" as a perfectly well-formed turn. That is a
    // green run that talked to nothing, and it is exactly what happened the first time.
    ...(options.claudeConfigDir === null
      ? {}
      : {
          CLAUDE_CONFIG_DIR:
            options.claudeConfigDir ??
            path.join(os.tmpdir(), `remote-claude-config-${String(ports.backend)}`),
        }),

    // A push provider that does not exist, deliberately. `.invalid` cannot resolve, so a run
    // that started notifying somebody would fail loudly rather than reach a real endpoint — and
    // no scenario here is about push: the credential file is absent, which the backend treats as
    // "not configured" without refusing to start (02 · D-20).
    RC_PUSH_ENDPOINT: 'https://push.invalid/v1/messages:send',
    RC_PUSH_CREDENTIALS_FILE: path.join(
      os.tmpdir(),
      `remote-claude-push-${String(ports.backend)}.json`,
    ),
    RC_PUSH_SCOPE: 'https://push.invalid/auth',

    RC_CHECKPOINT_DIR: path.join(os.tmpdir(), `remote-claude-checkpoints-${String(ports.backend)}`),
    RC_CHECKPOINT_MAX_FILE_BYTES: '5242880',
    RC_CHECKPOINT_MAX_STORE_BYTES: '524288000',

    // The floor, and the job **off**. The retention spec plants rows past the window and purges them
    // through `pnpm db purge`, the door it is testing; a job waking up a minute after boot would race
    // it for the same rows and the same lock, at a moment that depends on how fast the machine is.
    // The job itself is proved in the backend's own suites, at instants they choose.
    RC_AUDIT_RETENTION_DAYS: '90',
    RC_AUDIT_PURGE_INTERVAL_MS: 'off',
  };
}

/**
 * The numbers of the **limits stack** — plan 05, F4.
 *
 * The scenarios of the limits are about the limits themselves, and the numbers the rest of the
 * suite needs are the opposite of theirs: a thirty-minute TTL no test waits out, a rate of five
 * thousand frames a second no client reaches, ten sessions nobody fills. So they get a backend of
 * their own, beside the main one, with these five settings tightened and everything else — the
 * database, the realm, the allowlist — shared:
 *
 * - **two sessions**, floor and ceiling both, so the ceiling is two on any machine and a test fills
 *   it in two steps rather than by finding out how much RAM the runner has;
 * - **twenty seconds idle**, so a session is reaped within a scenario (the reaper looks every
 *   quarter of it), and long enough that one being filled is not reaped under the test's feet;
 * - **twenty frames a second**, the product's own number, so the rate a client is refused at is the
 *   one a real installation refuses at;
 * - **a minute to answer a permission**, so a turn can stay open across the expiry of a credential.
 *
 * Never used by the other specs: a TTL of twenty seconds on the main stack would reap sessions from
 * under any spec that paused, and a rate of twenty would make the three that overflow the replay
 * buffer take a minute each.
 */
export const LIMITS_STACK = {
  RC_SESSION_MAX_CONCURRENT: '2',
  RC_SESSION_MIN_CONCURRENT: '2',
  RC_SESSION_IDLE_TTL_MS: '20000',
  RC_WS_MAX_FRAMES_PER_SECOND: '20',
  RC_PERMISSION_TIMEOUT_MS: '60000',
};

/**
 * The two ports of the limits stack — its backend and its web. PostgreSQL and Keycloak are the
 * main stack's.
 *
 * @typedef {{ backend: number, web: number }} LimitsPorts
 */

/**
 * The environment of the limits stack: the ephemeral one, on its own two ports, with the limits
 * tightened.
 *
 * Its own ports move everything keyed on them — the CLI's configuration, the checkpoints, the push
 * credential path, the web origin the backend accepts — so the two backends share a database and a
 * realm and nothing else.
 *
 * @param {StackPorts} ports the main stack's
 * @param {LimitsPorts} limitsPorts
 * @returns {EphemeralEnvironment}
 */
export function limitsEnvironment(ports, limitsPorts) {
  return {
    ...ephemeralEnvironment({ ...ports, backend: limitsPorts.backend, web: limitsPorts.web }),
    ...LIMITS_STACK,
  };
}

/**
 * The administrator of the ephemeral Keycloak.
 *
 * Pinned, like the database's, rather than left to compose's default: the limits scenarios shorten
 * a client's token lifetime for the length of one test (S-44) and end a user's sessions at the
 * provider (S-79), and a suite that learnt the password from whichever `.env` was on the machine
 * would pass on one and fail on the next.
 */
export const E2E_KEYCLOAK_ADMIN = { username: 'admin', password: 'admin' };

/**
 * The `.env` the Playwright process reads, as text.
 *
 * Written by `run-e2e-local` and deleted by it, so the suite never has to be told where the stack
 * of this particular run ended up. It is a generated file: a stale copy is worse than none, which
 * is why the cleanup removes it even when the run failed.
 *
 * @param {StackPorts} ports
 * @param {{ claudeConfigDir?: string | null, limits?: LimitsPorts | null }} [options] the same
 *   choice the environment was built with, and the ports of the limits stack when this run has one
 * @returns {string}
 */
export function e2eDotEnv(ports, options = {}) {
  const urls = serviceUrls(ports);
  const environment = ephemeralEnvironment(ports, options);
  const limits = options.limits ?? null;

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

    // Where the backend of this run reads the CLI's configuration. The suite needs it to mark a
    // directory as trusted and to check the backend cleared the mark — the one behaviour that,
    // left alone, switches the human approval off in silence.
    RC_CLAUDE_CONFIG_DIR: environment.CLAUDE_CONFIG_DIR ?? claudeCliConfigDir(),

    // The backend's own log of this run. Only the live suite reads it, and for one line: the
    // warning the mapper writes when the SDK sends a variant this build has never seen.
    RC_BACKEND_LOG: BACKEND_LOG_FILE,

    // The database of this run. Read by the retention spec and by nothing else: rows ninety days
    // old cannot come through any door of the product — every writer stamps the present — so the
    // spec plants them, and then purges them through the one door that exists for that.
    RC_DATABASE_URL: environment.DATABASE_URL,

    // The provider's administrator, for the two limits scenarios that change what the provider
    // does — a shorter token (S-44), a session ended there (S-79). Nothing else reads it.
    RC_KEYCLOAK_ADMIN: environment.RC_KEYCLOAK_ADMIN,
    RC_KEYCLOAK_ADMIN_PASSWORD: environment.RC_KEYCLOAK_ADMIN_PASSWORD,

    // The limits stack, when the run has one. The live run does not: its suite is about the real
    // Claude, and a second backend would only be something more to start and nothing more to prove.
    ...(limits === null ? {} : limitsDotEnv(ports, limits)),
  };

  const body = Object.entries(values)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n');

  return `# Written by scripts/run-e2e-local.mjs, and deleted when the run ends. Never commit it.\n${body}\n`;
}

/**
 * The addresses of the limits stack, as the suite reads them.
 *
 * @param {StackPorts} ports
 * @param {LimitsPorts} limits
 * @returns {Record<string, string>}
 */
function limitsDotEnv(ports, limits) {
  const urls = serviceUrls({ ...ports, backend: limits.backend, web: limits.web });

  return {
    RC_LIMITS_WEB_URL: urls.web,
    RC_LIMITS_BACKEND_URL: urls.backend,
    RC_LIMITS_WS_URL: `${urls.backend.replace(/^http/, 'ws')}/ws`,
  };
}

/**
 * Where this machine's Claude CLI keeps its configuration, by its own rules.
 *
 * `CLAUDE_CONFIG_DIR` when the developer set one, and `~/.claude` otherwise — which is where the
 * login is. Only the suite reads this; the backend of a live run is given no variable at all, so
 * that the CLI and the backend both fall back to the same defaults.
 *
 * @returns {string}
 */
export function claudeCliConfigDir() {
  const configured = process.env['CLAUDE_CONFIG_DIR'];

  return configured === undefined || configured === ''
    ? path.join(os.homedir(), '.claude')
    : configured;
}

/** Where the backend's log of an ephemeral run is written. Generated, and never committed. */
export const BACKEND_LOG_FILE = path.join(repoRoot, 'e2e', '.backend.log');

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

/** The backend route the startup scripts poll; the only one with no authentication. */
export const HEALTH_PATH = '/health';

/** The path the backend's WebSocket gateway listens on. */
export const WS_PATH = '/ws';

/**
 * The first IPv4 address of this machine that another device on the network can reach.
 *
 * The backend binds every interface, so a phone on the same network talks to it through this
 * address — `localhost` on the phone is the phone.
 *
 * @param {NodeJS.Dict<import('node:os').NetworkInterfaceInfo[]>} [interfaces]
 * @returns {string | null} null when the machine has no external IPv4 interface
 */
export function lanAddress(interfaces = os.networkInterfaces()) {
  for (const entries of Object.values(interfaces)) {
    const external = (entries ?? []).find((entry) => entry.family === 'IPv4' && !entry.internal);

    if (external !== undefined) {
      return external.address;
    }
  }

  return null;
}

/**
 * @typedef {object} BoardRow
 * @property {string} name what a human calls the service
 * @property {number} port the port published on this machine
 * @property {string} address where it answers
 * @property {[string, string][]} details secondary addresses, as label and value
 * @property {string} [workspace] the watch process it depends on, for the rows that have one
 */

/**
 * What the URL board of `pnpm dev` shows: every service, its port, and every address worth
 * typing into something.
 *
 * The database password is left out on purpose — the board is the part of the output people
 * paste into chats and issues.
 *
 * @param {StackPorts} ports
 * @param {{ env?: NodeJS.ProcessEnv, lan?: string | null }} [options] `lan` is the address a
 *   phone reaches the backend through, or null when there is none
 * @returns {BoardRow[]}
 */
export function boardRows(ports, options = {}) {
  const env = options.env ?? {};
  const urls = serviceUrls(ports);
  const user = env['RC_POSTGRES_USER'] ?? E2E_POSTGRES.user;
  const db = env['RC_POSTGRES_DB'] ?? E2E_POSTGRES.db;
  const ws = `${urls.backend.replace(/^http/, 'ws')}${WS_PATH}`;

  /** @type {[string, string][]} */
  const backendDetails = [
    ['health', `${urls.backend}${HEALTH_PATH}`],
    ['WebSocket', ws],
  ];

  if (options.lan !== undefined && options.lan !== null) {
    backendDetails.push(['network', `http://${options.lan}:${String(ports.backend)}`]);
  }

  return [
    {
      name: 'PostgreSQL',
      port: ports.postgres,
      address: `postgresql://${user}@${urls.postgres}/${db}`,
      details: [],
    },
    {
      name: 'Keycloak',
      port: ports.keycloak,
      address: urls.keycloak,
      details: [
        ['admin console', `${urls.keycloak}/admin`],
        ['OIDC issuer', urls.realm],
      ],
    },
    {
      name: 'Backend',
      port: ports.backend,
      address: urls.backend,
      details: backendDetails,
      workspace: 'backend',
    },
    { name: 'Web', port: ports.web, address: urls.web, details: [], workspace: 'web' },
  ];
}

/** File settings of the `.env` that are written relative to the repository root. */
export const REPO_RELATIVE_PATHS = ['RC_WORKSPACE_ALLOWLIST_FILE', 'RC_PID_FILE'];

/**
 * The environment the watch processes of `pnpm dev` are started with.
 *
 * `.env` writes its paths relative to the repository, and the backend runs from its own folder:
 * passed through as they are, `./infra/…` would be looked up under `backend/infra/…`. The
 * ephemeral stack avoids the same trap by writing absolute paths; this does it for the `.env`.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [root]
 * @returns {NodeJS.ProcessEnv}
 */
export function watchEnvironment(env, root = repoRoot) {
  /** @type {NodeJS.ProcessEnv} */
  const resolved = { ...env };

  for (const key of REPO_RELATIVE_PATHS) {
    const value = env[key]?.trim();

    if (value !== undefined && value !== '') {
      resolved[key] = path.resolve(root, value);
    }
  }

  return resolved;
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

/** The push settings the real-push run takes from the repository `.env`, and nothing else. */
export const REAL_PUSH_KEYS = ['RC_PUSH_ENDPOINT', 'RC_PUSH_CREDENTIALS_FILE', 'RC_PUSH_SCOPE'];

/**
 * How long a permission waits in the real-push run.
 *
 * The hermetic suite gives five seconds, because nothing there travels further than this machine.
 * A real notification goes through the provider, reaches the phone, and is tapped by the test — a
 * round trip of seconds that five would turn into a race the deadline wins.
 */
export const REAL_PUSH_PERMISSION_TIMEOUT_MS = '60000';

/**
 * The overrides that turn the hermetic stack into the one that really notifies — plan 02, D-26.
 *
 * Only the push settings are read from the `.env`, and only for this run: everything else stays as
 * hermetic as the default suite, so a real notification is the one thing this run adds. The
 * credential path is resolved against the repository, since the backend runs from its own folder.
 *
 * @param {string} dotEnvText the contents of the repository `.env`
 * @param {{ root?: string, exists?: (file: string) => boolean }} [options]
 * @returns {{ env: Record<string, string> } | { problem: string }}
 */
export function realPushEnvironment(dotEnvText, options = {}) {
  const root = options.root ?? repoRoot;
  const exists = options.exists ?? fs.existsSync;
  const parsed = parseEnv(dotEnvText);

  const missing = REAL_PUSH_KEYS.filter((key) => (parsed[key] ?? '').trim() === '');
  if (missing.length > 0) {
    return { problem: `the .env does not set ${missing.join(', ')}` };
  }

  const endpoint = String(parsed['RC_PUSH_ENDPOINT']);
  if (new URL(endpoint).hostname.endsWith('.invalid')) {
    return { problem: `RC_PUSH_ENDPOINT in the .env still points at ${endpoint}` };
  }

  const credentials = path.resolve(root, String(parsed['RC_PUSH_CREDENTIALS_FILE']));
  if (!exists(credentials)) {
    return { problem: `the push credential file does not exist: ${credentials}` };
  }

  return {
    env: {
      RC_PUSH_ENDPOINT: endpoint,
      RC_PUSH_CREDENTIALS_FILE: credentials,
      RC_PUSH_SCOPE: String(parsed['RC_PUSH_SCOPE']),
      RC_PERMISSION_TIMEOUT_MS: REAL_PUSH_PERMISSION_TIMEOUT_MS,
    },
  };
}

/**
 * The defines the app is compiled with that come straight from `e2e/.env`, and the variable each
 * is read from. A value missing there is compiled in empty — never as the text "undefined".
 *
 * The last five are for the limits scenarios: the limits stack, and the provider's administrator.
 * Compiled in like everything else, because on a device there is no `e2e/.env` to read them from.
 */
const DART_DEFINES_FROM_DOT_ENV = {
  RC_API_URL: 'RC_BACKEND_URL',
  RC_WS_URL: 'RC_WS_URL',
  RC_OIDC_ISSUER: 'RC_OIDC_ISSUER',
  RC_OIDC_CLIENT_ID: 'RC_OIDC_CLIENT_ID_MOBILE',
  RC_OIDC_SCOPES: 'RC_OIDC_SCOPES',
  RC_LIMITS_API_URL: 'RC_LIMITS_BACKEND_URL',
  RC_LIMITS_WS_URL: 'RC_LIMITS_WS_URL',
  RC_KEYCLOAK_URL: 'RC_KEYCLOAK_URL',
  RC_KEYCLOAK_ADMIN: 'RC_KEYCLOAK_ADMIN',
  RC_KEYCLOAK_ADMIN_PASSWORD: 'RC_KEYCLOAK_ADMIN_PASSWORD',
};

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
    ...Object.fromEntries(
      Object.entries(DART_DEFINES_FROM_DOT_ENV).map(([define, key]) => [define, env[key] ?? '']),
    ),
    RC_OIDC_REDIRECT_URL: MOBILE_REDIRECT_URL,
    RC_APP_VERSION: appVersion,
    RC_SCENARIO: scenario,
  };

  return Object.entries(defines).flatMap(([name, value]) => ['--dart-define', `${name}=${value}`]);
}
