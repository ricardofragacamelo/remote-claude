import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PORT_VARIABLES,
  PROJECT_NAME,
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
