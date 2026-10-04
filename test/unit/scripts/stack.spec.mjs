import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  E2E_KEYCLOAK_ADMIN,
  E2E_PROJECT_PREFIX,
  LIMITS_STACK,
  MOBILE_REDIRECT_URL,
  dartDefines,
  defineArgs,
  realPushEnvironment,
  PORT_VARIABLES,
  PROJECT_NAME,
  REALM_PATH,
  boardRows,
  e2eDotEnv,
  e2eProjectName,
  projectOwner,
  ephemeralEnvironment,
  limitsEnvironment,
  loadDotEnv,
  projectName,
  issuerThrough,
  resolvePorts,
  serviceUrls,
  watchEnvironment,
  webOrigin,
  withWebIssuer,
  workspaceStatus,
} from '../../../scripts/lib/stack.mjs';
import { ALLOWLIST_FILE } from '../../../scripts/lib/workspaces.mjs';

/** @type {string[]} */
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-stack-'));
  temporary.push(dir);
  return dir;
}

describe('resolvePorts', () => {
  it('uses the fixed ports of the plan when nothing is set', () => {
    expect(resolvePorts({})).toEqual({
      postgres: 5432,
      keycloak: 8180,
      backend: 3000,
      web: 5173,
    });
  });

  it('honours every variable .env.example documents', () => {
    const env = Object.fromEntries(
      PORT_VARIABLES.map(({ variable }, index) => [variable, String(20_000 + index)]),
    );

    expect(Object.values(resolvePorts(env))).toEqual([20_000, 20_001, 20_002, 20_003]);
  });

  it('treats an empty value as unset', () => {
    expect(resolvePorts({ RC_WEB_PORT: '  ' }).web).toBe(5173);
  });

  it('refuses a value that is not a port, instead of silently using the default', () => {
    expect(() => resolvePorts({ RC_WEB_PORT: 'nope' })).toThrow(/RC_WEB_PORT="nope"/);
  });

  it('refuses a port outside the TCP range', () => {
    expect(() => resolvePorts({ RC_BACKEND_PORT: '0' })).toThrow(/not a valid TCP port/);
    expect(() => resolvePorts({ RC_BACKEND_PORT: '65536' })).toThrow(/not a valid TCP port/);
  });

  it('refuses a fractional port', () => {
    expect(() => resolvePorts({ RC_BACKEND_PORT: '3000.5' })).toThrow(/not a valid TCP port/);
  });
});

describe('serviceUrls', () => {
  it('builds every URL from the ports, realm included', () => {
    const urls = serviceUrls({ postgres: 5432, keycloak: 8180, backend: 3000, web: 5173 });

    expect(urls.postgres).toBe('localhost:5432');
    expect(urls.realm).toBe('http://localhost:8180/realms/remote-claude');
    expect(urls.discovery).toBe(
      'http://localhost:8180/realms/remote-claude/.well-known/openid-configuration',
    );
    expect(urls.backend).toBe('http://localhost:3000');
    expect(urls.web).toBe('http://localhost:5173');
    expect(urls.webRealm).toBe('http://localhost:5173/realms/remote-claude');
  });

  it('follows a moved port everywhere it appears', () => {
    const urls = serviceUrls({ postgres: 1, keycloak: 9999, backend: 3, web: 4 });

    expect(urls.keycloak).toBe('http://localhost:9999');
    expect(urls.discovery).toContain('http://localhost:9999/realms/');
  });
});

// Plan 10, B-27: the one origin of the stack, and the issuers the backend accepts.
describe('the origin of the stack and its issuers', () => {
  it('names the realm path and the web origin, the two halves of the app issuer (S-92)', () => {
    expect(REALM_PATH).toBe('/realms/remote-claude');
    expect(webOrigin(5173)).toBe('http://localhost:5173');
    expect(webOrigin('51004')).toBe('http://localhost:51004');
    expect(issuerThrough(webOrigin(5173))).toBe('http://localhost:5173/realms/remote-claude');
    expect(issuerThrough('https://h.dev', '/realms/other')).toBe('https://h.dev/realms/other');
  });

  const ISSUER = 'http://localhost:8180/realms/remote-claude';
  const WEB = 'http://localhost:5173/realms/remote-claude';

  it.each([
    ['nothing listed', undefined, WEB],
    ['an empty list', '', WEB],
    [
      'another origin listed',
      'https://h.dev/realms/remote-claude',
      `https://h.dev/realms/remote-claude,${WEB}`,
    ],
    ['the web issuer already listed', ` ${WEB}/ `, `${WEB}/`],
    ['stray commas and blanks', ` , ${WEB},`, WEB],
  ])('adds the web issuer to %s, once', (_what, listed, expected) => {
    const env = withWebIssuer({ OIDC_ISSUER: ISSUER, OIDC_ADDITIONAL_ISSUERS: listed }, 5173);

    expect(env['OIDC_ADDITIONAL_ISSUERS']).toBe(expected);
    expect(env['OIDC_ISSUER']).toBe(ISSUER);
  });

  it('follows the web port and the realm path of OIDC_ISSUER', () => {
    const env = withWebIssuer({ OIDC_ISSUER: 'http://localhost:8180/realms/other/' }, 5999);

    expect(env['OIDC_ADDITIONAL_ISSUERS']).toBe('http://localhost:5999/realms/other');
  });

  it('adds nothing when OIDC_ISSUER is the web issuer already', () => {
    expect(withWebIssuer({ OIDC_ISSUER: WEB }, 5173)['OIDC_ADDITIONAL_ISSUERS']).toBe('');
  });

  it('is stable under repetition', () => {
    const once = withWebIssuer({ OIDC_ISSUER: ISSUER }, 5173);

    expect(withWebIssuer(once, 5173)).toEqual(once);
  });

  it('S-130 · adds the web issuer on the local network too, after the loopback one, once', () => {
    const lan = 'http://192.168.0.10:5173/realms/remote-claude';
    const once = withWebIssuer({ OIDC_ISSUER: ISSUER }, 5173, '192.168.0.10');

    expect(once['OIDC_ADDITIONAL_ISSUERS']).toBe(`${WEB},${lan}`);
    expect(withWebIssuer(once, 5173, '192.168.0.10')).toEqual(once);
    expect(
      withWebIssuer(
        { OIDC_ISSUER: ISSUER, OIDC_ADDITIONAL_ISSUERS: `${lan}/` },
        5173,
        '192.168.0.10',
      )['OIDC_ADDITIONAL_ISSUERS'],
    ).toBe(`${lan}/,${WEB}`);
  });

  it('adds no network issuer when the machine has no local network address', () => {
    expect(withWebIssuer({ OIDC_ISSUER: ISSUER }, 5173, null)['OIDC_ADDITIONAL_ISSUERS']).toBe(WEB);
  });

  it.each([[{}], [{ OIDC_ISSUER: '' }], [{ OIDC_ISSUER: 'keycloak' }]])(
    'leaves an environment without a readable issuer alone, for the backend to name: %j',
    (env) => {
      expect(withWebIssuer(env, 5173)).toEqual(env);
    },
  );
});

describe('boardRows', () => {
  const ports = { postgres: 5432, keycloak: 8180, backend: 3000, web: 5173 };

  it('lists the four services, in start order, each with its port', () => {
    const rows = boardRows(ports);

    expect(rows.map((row) => [row.name, row.port])).toEqual([
      ['PostgreSQL', 5432],
      ['Keycloak', 8180],
      ['Backend', 3000],
      ['Web', 5173],
    ]);
  });

  it('ties only the backend and web rows to a watch process', () => {
    const rows = boardRows(ports);

    expect(rows.map((row) => row.workspace)).toEqual([undefined, undefined, 'backend', 'web']);
  });

  it('gives every address a client needs, and follows a moved port into each one', () => {
    const rows = boardRows({ postgres: 1, keycloak: 2, backend: 3, web: 4 });
    const [postgres, keycloak, backend, web] = rows;

    expect(postgres?.address).toBe('postgresql://remote_claude@localhost:1/remote_claude');
    expect(keycloak?.address).toBe('http://localhost:2');
    expect(keycloak?.details).toEqual([
      ['admin console', 'http://localhost:2/admin'],
      ['OIDC issuer', 'http://localhost:2/realms/remote-claude'],
    ]);
    expect(backend?.address).toBe('http://localhost:3');
    expect(backend?.details).toEqual([
      ['health', 'http://localhost:3/health'],
      ['WebSocket', 'ws://localhost:3/ws'],
    ]);
    expect(web?.address).toBe('http://localhost:4');
  });

  it('names the database and user the environment sets, and never the password', () => {
    const [postgres] = boardRows(ports, {
      env: { RC_POSTGRES_USER: 'alice', RC_POSTGRES_DB: 'rc', RC_POSTGRES_PASSWORD: 's3cret' },
    });

    expect(postgres?.address).toBe('postgresql://alice@localhost:5432/rc');
    expect(
      JSON.stringify(boardRows(ports, { env: { RC_POSTGRES_PASSWORD: 's3cret' } })),
    ).not.toContain('s3cret');
  });

  it('adds the network address of the backend and of the web when the machine has one', () => {
    const backend = boardRows(ports, { lan: '192.168.0.10' })[2];
    const web = boardRows(ports, { lan: '192.168.0.10' })[3];

    expect(web?.details).toEqual([['network', 'http://192.168.0.10:5173']]);

    expect(backend?.details).toContainEqual(['network', 'http://192.168.0.10:3000']);
  });

  it('adds the public addresses of the web, the API, the socket and the issuer under dev:public', () => {
    const [, keycloak, backend, web] = boardRows(ports, {
      lan: '192.168.0.10',
      origin: 'https://name.ngrok-free.dev',
    });

    expect(keycloak?.details).toContainEqual([
      'public issuer',
      'https://name.ngrok-free.dev/realms/remote-claude',
    ]);
    expect(keycloak?.details.map(([label]) => label)).not.toContain('public admin console');
    expect(backend?.details).toEqual(
      expect.arrayContaining([
        ['public API', 'https://name.ngrok-free.dev/api'],
        ['public health', 'https://name.ngrok-free.dev/api/health'],
        ['public WebSocket', 'wss://name.ngrok-free.dev/ws'],
      ]),
    );
    expect(web?.details).toEqual([
      ['network', 'http://192.168.0.10:5173'],
      ['public', 'https://name.ngrok-free.dev'],
    ]);
  });

  it('leaves the public addresses out of a local run', () => {
    for (const rows of [boardRows(ports, { origin: null }), boardRows(ports)]) {
      const labels = rows.flatMap((row) => row.details.map(([label]) => label));
      expect(labels.filter((label) => label.startsWith('public'))).toEqual([]);
    }
  });

  it('leaves the network address out when there is none', () => {
    for (const backend of [boardRows(ports, { lan: null })[2], boardRows(ports)[2]]) {
      expect(backend?.details.map(([label]) => label)).toEqual(['health', 'WebSocket']);
    }
  });
});

describe('watchEnvironment', () => {
  it('resolves a relative allowlist path against the repository, not the backend folder', () => {
    const env = watchEnvironment({ RC_WORKSPACE_ALLOWLIST_FILE: './infra/a.yaml' }, '/repo');

    expect(env['RC_WORKSPACE_ALLOWLIST_FILE']).toBe(path.resolve('/repo', 'infra/a.yaml'));
  });

  it('keeps an absolute path, and every other variable, as they are', () => {
    const env = watchEnvironment({ RC_WORKSPACE_ALLOWLIST_FILE: '/etc/a.yaml', OTHER: './x' });

    expect(env).toEqual({ RC_WORKSPACE_ALLOWLIST_FILE: '/etc/a.yaml', OTHER: './x' });
  });

  it('resolves the pid file against the repository too — plan 06, B-11', () => {
    const env = watchEnvironment({ RC_PID_FILE: './.run/backend.pid' }, '/repo');

    expect(env['RC_PID_FILE']).toBe(path.resolve('/repo', '.run/backend.pid'));
  });

  it('leaves an unset or blank path alone, for the backend to report', () => {
    expect(watchEnvironment({}, '/repo')).toEqual({});
    expect(watchEnvironment({ RC_WORKSPACE_ALLOWLIST_FILE: ' ' }, '/repo')).toEqual({
      RC_WORKSPACE_ALLOWLIST_FILE: ' ',
    });
  });
});

describe('projectName', () => {
  it('is the development stack by default', () => {
    expect(projectName({})).toBe(PROJECT_NAME);
  });

  it('honours compose’s own variable, so a throwaway stack never collides with the dev one', () => {
    expect(projectName({ COMPOSE_PROJECT_NAME: 'remote-claude-e2e-7' })).toBe(
      'remote-claude-e2e-7',
    );
  });

  it('treats a blank value as unset', () => {
    expect(projectName({ COMPOSE_PROJECT_NAME: '   ' })).toBe(PROJECT_NAME);
  });
});

describe('loadDotEnv', () => {
  it('loads the file into the environment when it exists', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, '.env'), 'RC_STACK_SPEC_MARKER=loaded\n');

    expect(loadDotEnv(dir)).toBe(true);
    expect(process.env['RC_STACK_SPEC_MARKER']).toBe('loaded');
    delete process.env['RC_STACK_SPEC_MARKER'];
  });

  it('says so, without failing, when there is no .env — a fresh clone has none', () => {
    expect(loadDotEnv(tempDir())).toBe(false);
  });
});

describe('workspaceStatus', () => {
  it('reports a workspace that does not exist yet, rather than failing on it', () => {
    expect(workspaceStatus(tempDir(), 'backend')).toEqual({
      ready: false,
      reason: 'not created yet',
    });
  });

  it('reports a workspace whose manifest has no dev script', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'web'));
    fs.writeFileSync(path.join(dir, 'web/package.json'), '{"name":"web","scripts":{"build":"x"}}');

    expect(workspaceStatus(dir, 'web')).toEqual({ ready: false, reason: 'has no `dev` script' });
  });

  it('reports a workspace that can be started in watch mode', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'web'));
    fs.writeFileSync(path.join(dir, 'web/package.json'), '{"name":"web","scripts":{"dev":"vite"}}');

    expect(workspaceStatus(dir, 'web')).toEqual({ ready: true });
  });
});

describe('the ephemeral stack of an e2e run', () => {
  const ports = { postgres: 51_001, keycloak: 51_002, backend: 51_003, web: 51_004 };

  it('names a project of its own, never the development one', () => {
    const project = e2eProjectName(ports.backend, 4242);

    expect(project).toBe(`${PROJECT_NAME}-e2e-51003-p4242`);
    expect(project.startsWith(E2E_PROJECT_PREFIX)).toBe(true);

    // The purge scans that prefix. The development project must not be inside it, or `pnpm
    // test:e2e` would tear down the stack somebody has running in another terminal.
    expect(PROJECT_NAME.startsWith(E2E_PROJECT_PREFIX)).toBe(false);
  });

  it('gives two runs two different projects', () => {
    expect(e2eProjectName(51_003)).not.toBe(e2eProjectName(51_004));
  });

  // S-40 — the owner in the name is what lets a purge tell a run beside it from one in the past.
  it('names the run that owns it, this one unless told otherwise', () => {
    expect(projectOwner(e2eProjectName(51_003))).toBe(process.pid);
    expect(projectOwner(e2eProjectName(51_003, 77))).toBe(77);
  });

  it('reads no owner from a project created before projects carried one', () => {
    expect(projectOwner(`${E2E_PROJECT_PREFIX}51003`)).toBeNull();
    expect(projectOwner(`${E2E_PROJECT_PREFIX}stale-12`)).toBeNull();
  });

  it('points the database URL at the port compose actually published', () => {
    const env = ephemeralEnvironment(ports);

    expect(env.RC_POSTGRES_PORT).toBe('51001');
    expect(env.DATABASE_URL).toContain('@localhost:51001/');
    expect(env.DATABASE_URL.startsWith('postgresql://')).toBe(true);
  });

  it('pins the credentials instead of inheriting whatever the machine has in .env', () => {
    const env = ephemeralEnvironment(ports);

    expect(env.RC_POSTGRES_USER).toBe('remote_claude');
    expect(env.RC_POSTGRES_DB).toBe('remote_claude');
    expect(env.DATABASE_URL).toContain('remote_claude:remote_claude@');
  });

  it('derives the issuer from the Keycloak port it was given', () => {
    expect(ephemeralEnvironment(ports).OIDC_ISSUER).toBe(
      'http://localhost:51002/realms/remote-claude',
    );
  });

  it('accepts the realm through the web origin too, the one the phone signs in through — plan 10, D-15', () => {
    expect(ephemeralEnvironment(ports).OIDC_ADDITIONAL_ISSUERS).toBe(
      'http://localhost:51004/realms/remote-claude',
    );
  });

  it('runs on the shipped allowlist and writes no pid file, whatever this machine freed — plan 06, S-59', () => {
    const env = ephemeralEnvironment(ports);

    // A run never reads the local copy `pnpm allowlist` writes, and never leaves a pid for it to
    // signal: what a developer freed on their machine cannot change a test.
    expect(env.RC_WORKSPACE_ALLOWLIST_FILE).toBe(ALLOWLIST_FILE);
    expect(env.RC_WORKSPACE_ALLOWLIST_FILE).not.toContain('.local.');
    expect(env.RC_PID_FILE).toBe('off');
  });

  it('declares every variable the backend refuses to start without', () => {
    const declared = Object.keys(ephemeralEnvironment(ports));

    // The backend's schema has no default anywhere: a variable missing here is a process that
    // does not start, and an e2e run that fails for a reason that looks nothing like its cause.
    for (const { variable } of PORT_VARIABLES) {
      expect(declared, variable).toContain(variable);
    }

    for (const variable of ['NODE_ENV', 'LOG_LEVEL', 'OIDC_AUDIENCE', 'OIDC_CLIENT_ID_WEB']) {
      expect(declared, variable).toContain(variable);
    }
  });

  it('writes a .env the suite can read, with the websocket URL derived from the backend one', () => {
    const written = e2eDotEnv(ports);
    const values = Object.fromEntries(
      written
        .split('\n')
        .filter((row) => row.trim() !== '' && !row.startsWith('#'))
        .map((row) => row.split('=', 2)),
    );

    expect(values['RC_WEB_URL']).toBe('http://localhost:51004');
    expect(values['RC_BACKEND_URL']).toBe('http://localhost:51003');
    expect(values['RC_WS_URL']).toBe('ws://localhost:51003/ws');
    expect(values['RC_OIDC_ISSUER']).toBe('http://localhost:51002/realms/remote-claude');
    expect(values['RC_OIDC_REALM_PATH']).toBe('/realms/remote-claude');
    expect(values['RC_DATABASE_URL']).toBe(ephemeralEnvironment(ports).DATABASE_URL);
  });

  it('switches the purge job off, so it cannot race the retention spec for its rows', () => {
    expect(ephemeralEnvironment(ports).RC_AUDIT_PURGE_INTERVAL_MS).toBe('off');
    expect(ephemeralEnvironment(ports).RC_AUDIT_RETENTION_DAYS).toBe('90');
  });

  it('says in the file itself that it is generated, so nobody commits one', () => {
    expect(e2eDotEnv(ports).split('\n')[0]).toMatch(/^#.*deleted when the run ends/);
  });

  it('pins the provider administrator, for compose and for the two scenarios that need it', () => {
    const env = ephemeralEnvironment(ports);

    expect(env.RC_KEYCLOAK_ADMIN).toBe(E2E_KEYCLOAK_ADMIN.username);
    expect(env.RC_KEYCLOAK_ADMIN_PASSWORD).toBe(E2E_KEYCLOAK_ADMIN.password);
    expect(dotEnvValues(e2eDotEnv(ports))['RC_KEYCLOAK_ADMIN']).toBe(E2E_KEYCLOAK_ADMIN.username);
  });
});

/**
 * The `KEY=value` rows of a generated `.env`, as a map.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function dotEnvValues(text) {
  return Object.fromEntries(
    text
      .split('\n')
      .filter((row) => row.trim() !== '' && !row.startsWith('#'))
      .map((row) => row.split('=', 2)),
  );
}

describe('the limits stack of an e2e run — plan 05, S-82', () => {
  const ports = { postgres: 51_001, keycloak: 51_002, backend: 51_003, web: 51_004 };
  const limits = { backend: 51_005, web: 51_006 };

  it('tightens exactly the five limits, to the numbers the scenarios are written against', () => {
    const env = limitsEnvironment(ports, limits);

    expect(LIMITS_STACK).toEqual({
      RC_SESSION_MAX_CONCURRENT: '2',
      RC_SESSION_MIN_CONCURRENT: '2',
      RC_SESSION_IDLE_TTL_MS: '20000',
      RC_WS_MAX_FRAMES_PER_SECOND: '20',
      RC_PERMISSION_TIMEOUT_MS: '60000',
    });
    expect(env).toMatchObject(LIMITS_STACK);
  });

  it('shares the database and the provider with the main stack, and inherits everything else', () => {
    const main = ephemeralEnvironment(ports);
    const env = limitsEnvironment(ports, limits);

    expect(env.DATABASE_URL).toBe(main.DATABASE_URL);
    expect(env.OIDC_ISSUER).toBe(main.OIDC_ISSUER);
    expect(env.OIDC_AUDIENCE).toBe(main.OIDC_AUDIENCE);
    expect(env.RC_WORKSPACE_ALLOWLIST_FILE).toBe(main.RC_WORKSPACE_ALLOWLIST_FILE);
    expect(env.RC_PERMISSION_EXTENSION_MS).toBe(main.RC_PERMISSION_EXTENSION_MS);
    expect(Object.keys(env).sort()).toEqual(Object.keys(main).sort());
  });

  it('runs on its own two ports, with the folders and the origin that follow from them', () => {
    const main = ephemeralEnvironment(ports);
    const env = limitsEnvironment(ports, limits);

    expect(env.RC_BACKEND_PORT).toBe('51005');
    expect(env.RC_WEB_PORT).toBe('51006');
    // Keyed on the backend port, so the two backends never write each other's CLI configuration,
    // checkpoints or push credential.
    expect(env.CLAUDE_CONFIG_DIR).not.toBe(main.CLAUDE_CONFIG_DIR);
    expect(env.RC_CHECKPOINT_DIR).not.toBe(main.RC_CHECKPOINT_DIR);
    expect(env.RC_PUSH_CREDENTIALS_FILE).not.toBe(main.RC_PUSH_CREDENTIALS_FILE);
    // Its own web is the origin its phone signs in through (plan 10, D-15).
    expect(env.OIDC_ADDITIONAL_ISSUERS).toBe('http://localhost:51006/realms/remote-claude');
  });

  it('is announced in e2e/.env when the run has one', () => {
    const values = dotEnvValues(e2eDotEnv(ports, { limits }));

    expect(values['RC_LIMITS_WEB_URL']).toBe('http://localhost:51006');
    expect(values['RC_LIMITS_BACKEND_URL']).toBe('http://localhost:51005');
    expect(values['RC_LIMITS_WS_URL']).toBe('ws://localhost:51005/ws');
    // The main stack's addresses are still the main stack's.
    expect(values['RC_BACKEND_URL']).toBe('http://localhost:51003');
  });

  it('is left out of e2e/.env entirely when the run has none — the live run', () => {
    for (const written of [e2eDotEnv(ports), e2eDotEnv(ports, { limits: null })]) {
      expect(
        Object.keys(dotEnvValues(written)).filter((name) => name.startsWith('RC_LIMITS_')),
      ).toEqual([]);
    }
  });
});

describe('dartDefines', () => {
  const ports = { postgres: 51_001, keycloak: 51_002, backend: 51_003, web: 51_004 };

  /** The `e2e/.env` of a run, as the Flutter end reads it back. */
  function dotEnv() {
    return Object.fromEntries(
      e2eDotEnv(ports)
        .split('\n')
        .filter((row) => row.trim() !== '' && !row.startsWith('#'))
        .map((row) => row.split('=', 2)),
    );
  }

  /** The defines as a map, which is how they are read rather than how they are passed. */
  function definesOf(scenario = '{}', version = '1.2.3') {
    const argv = dartDefines(dotEnv(), scenario, version);
    /** @type {Record<string, string>} */
    const values = {};

    for (let index = 0; index < argv.length; index += 2) {
      const [name, value] = String(argv[index + 1]).split('=', 2);
      values[String(name)] = String(value);
    }

    return { argv, values };
  }

  it('passes each value as its own `--dart-define` pair', () => {
    const { argv } = definesOf();

    expect(argv.filter((argument) => argument === '--dart-define')).toHaveLength(argv.length / 2);
    expect(argv[0]).toBe('--dart-define');
  });

  it('S-92 · points the app at the web server of the stack the browser suite reads, one origin', () => {
    const { values } = definesOf();

    expect(values['RC_INTERNAL_URL']).toBe(`http://localhost:${String(ports.web)}`);
    expect(values['RC_EXTERNAL_URL']).toBe('');
    expect(values['RC_OIDC_REALM_PATH']).toBe('/realms/remote-claude');
    expect(values).not.toHaveProperty('RC_API_URL');
    expect(values).not.toHaveProperty('RC_WS_URL');
    expect(values).not.toHaveProperty('RC_OIDC_ISSUER');
  });

  it('signs in as the **mobile** client, not the browser one', () => {
    expect(definesOf().values['RC_OIDC_CLIENT_ID']).toBe('remote-claude-mobile');
  });

  it('carries the deep link the realm registers for the app', () => {
    expect(definesOf().values['RC_OIDC_REDIRECT_URL']).toBe(MOBILE_REDIRECT_URL);
    expect(MOBILE_REDIRECT_URL.startsWith('br.com.remoteclaude.app://')).toBe(true);
  });

  it('compiles the shared scenario in, because a device has no repository to read it from', () => {
    const scenario = JSON.stringify({ id: 'S-62', expect: { firstSeq: 1 } });

    expect(definesOf(scenario).values['RC_SCENARIO']).toBe(scenario);
  });

  it('reports the version it was given', () => {
    expect(definesOf('{}', '9.9.9').values['RC_APP_VERSION']).toBe('9.9.9');
  });

  it('carries the limits stack and the provider administrator, for the limits scenarios', () => {
    const argv = dartDefines(
      dotEnvValues(e2eDotEnv(ports, { limits: { backend: 51_005, web: 51_006 } })),
      '{}',
      '1.0.0',
    );

    // The web server of the limits stack: the origin the app is pointed at for those scenarios.
    expect(argv).toContain('RC_LIMITS_ORIGIN=http://localhost:51006');
    expect(argv).toContain('RC_KEYCLOAK_URL=http://localhost:51002');
    expect(argv).toContain(`RC_KEYCLOAK_ADMIN=${E2E_KEYCLOAK_ADMIN.username}`);
    expect(argv).toContain(`RC_KEYCLOAK_ADMIN_PASSWORD=${E2E_KEYCLOAK_ADMIN.password}`);
  });

  it('answers an empty value rather than `undefined` when the .env is missing one', () => {
    // `undefined` would reach the command line as the four letters "undefined", and the app would
    // start with a URL that looks valid and points nowhere.
    const argv = dartDefines({}, '{}', '1.0.0');

    expect(argv).not.toContain('RC_INTERNAL_URL=undefined');
    expect(argv).toContain('RC_INTERNAL_URL=');
  });
});

describe('defineArgs', () => {
  it('passes each value as the flag and then NAME=value, spaces and all', () => {
    expect(defineArgs({ RC_A: 'one', RC_SCOPES: 'openid profile' })).toEqual([
      '--dart-define',
      'RC_A=one',
      '--dart-define',
      'RC_SCOPES=openid profile',
    ]);
  });

  it('answers nothing for no values', () => {
    expect(defineArgs({})).toEqual([]);
  });
});

// Plan 02, D-26 — the run that really notifies takes the push settings, and only them, from .env.
describe('realPushEnvironment', () => {
  const dotEnv = [
    'RC_PUSH_ENDPOINT=https://fcm.googleapis.com/v1/projects/p/messages:send',
    'RC_PUSH_CREDENTIALS_FILE=./.secrets/push-credentials.json',
    'RC_PUSH_SCOPE=https://www.googleapis.com/auth/firebase.messaging',
    'RC_DATABASE_URL=postgres://not-this-one',
  ].join('\n');

  it('takes the three push settings, resolves the credential, and lengthens the deadline', () => {
    const result = realPushEnvironment(dotEnv, { root: '/repo', exists: () => true });

    expect(result).toEqual({
      env: {
        RC_PUSH_ENDPOINT: 'https://fcm.googleapis.com/v1/projects/p/messages:send',
        RC_PUSH_CREDENTIALS_FILE: '/repo/.secrets/push-credentials.json',
        RC_PUSH_SCOPE: 'https://www.googleapis.com/auth/firebase.messaging',
        RC_PERMISSION_TIMEOUT_MS: '60000',
      },
    });
  });

  it('takes nothing else from the .env', () => {
    const result = realPushEnvironment(dotEnv, { root: '/repo', exists: () => true });

    expect(Object.keys('env' in result ? result.env : {})).not.toContain('RC_DATABASE_URL');
  });

  it('refuses a .env that does not set every push setting, naming the missing ones', () => {
    expect(realPushEnvironment('RC_PUSH_SCOPE=x', { exists: () => true })).toEqual({
      problem: 'the .env does not set RC_PUSH_ENDPOINT, RC_PUSH_CREDENTIALS_FILE',
    });
  });

  it('refuses an endpoint that is still the placeholder', () => {
    const placeholder = dotEnv.replace(
      'https://fcm.googleapis.com/v1/projects/p/messages:send',
      'https://push.invalid/v1/messages:send',
    );

    expect(realPushEnvironment(placeholder, { exists: () => true })).toHaveProperty('problem');
  });

  it('refuses a credential file that is not there', () => {
    const result = realPushEnvironment(dotEnv, { root: '/repo', exists: () => false });

    expect(result).toEqual({
      problem: 'the push credential file does not exist: /repo/.secrets/push-credentials.json',
    });
  });
});
