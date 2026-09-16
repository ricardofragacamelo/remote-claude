import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  E2E_PROJECT_PREFIX,
  MOBILE_REDIRECT_URL,
  dartDefines,
  PORT_VARIABLES,
  PROJECT_NAME,
  e2eDotEnv,
  e2eProjectName,
  ephemeralEnvironment,
  loadDotEnv,
  projectName,
  resolvePorts,
  serviceUrls,
  workspaceStatus,
} from '../../../scripts/lib/stack.mjs';

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
  });

  it('follows a moved port everywhere it appears', () => {
    const urls = serviceUrls({ postgres: 1, keycloak: 9999, backend: 3, web: 4 });

    expect(urls.keycloak).toBe('http://localhost:9999');
    expect(urls.discovery).toContain('http://localhost:9999/realms/');
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
    const project = e2eProjectName(ports.backend);

    expect(project).toBe(`${PROJECT_NAME}-e2e-51003`);
    expect(project.startsWith(E2E_PROJECT_PREFIX)).toBe(true);

    // The purge scans that prefix. The development project must not be inside it, or `pnpm
    // test:e2e` would tear down the stack somebody has running in another terminal.
    expect(PROJECT_NAME.startsWith(E2E_PROJECT_PREFIX)).toBe(false);
  });

  it('gives two runs two different projects', () => {
    expect(e2eProjectName(51_003)).not.toBe(e2eProjectName(51_004));
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
  });

  it('says in the file itself that it is generated, so nobody commits one', () => {
    expect(e2eDotEnv(ports).split('\n')[0]).toMatch(/^#.*deleted when the run ends/);
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

  it('points the app at the same stack the browser suite reads from e2e/.env', () => {
    const { values } = definesOf();

    expect(values['RC_API_URL']).toBe('http://localhost:51003');
    expect(values['RC_WS_URL']).toBe('ws://localhost:51003/ws');
    expect(values['RC_OIDC_ISSUER']).toBe('http://localhost:51002/realms/remote-claude');
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

  it('answers an empty value rather than `undefined` when the .env is missing one', () => {
    // `undefined` would reach the command line as the four letters "undefined", and the app would
    // start with a URL that looks valid and points nowhere.
    const argv = dartDefines({}, '{}', '1.0.0');

    expect(argv).not.toContain('RC_API_URL=undefined');
    expect(argv).toContain('RC_API_URL=');
  });
});
