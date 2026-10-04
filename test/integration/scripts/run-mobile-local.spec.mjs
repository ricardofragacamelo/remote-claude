import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAsync } from '../../../scripts/lib/exec.mjs';

// Each run spawns node and probes HTTP; the default 5 s is a unit-test budget.
vi.setConfig({ testTimeout: 60_000 });

/**
 * `pnpm dev:mobile` as the terminal sees it, up to the point where a device would be needed.
 *
 * Everything before the device is checked here: a run that cannot work has to say why and exit
 * 1 **before** it boots an emulator or starts a build — those are minutes, and leaving one behind
 * is the failure this script exists to prevent. The device half is covered in
 * `test/unit/scripts/android-host.spec.mjs` and `emulator.spec.mjs`, with the host handed in.
 *
 * Every variable the script reads is set here, so the outcome does not depend on the `.env` of
 * the machine running the suite — or on there being one: the environment wins over the file.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** @type {http.Server[]} */
const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    ),
  );
});

/**
 * A stand-in for the stack `pnpm dev` keeps up, as the app reaches it — through the web server,
 * which forwards the backend's health route and the issuer's discovery document (plan 10, B-27) —
 * or refusing everything, when `up` is false.
 *
 * @param {boolean} up
 * @returns {Promise<number>} the port it listens on
 */
function fakeStack(up) {
  const server = http.createServer((_request, response) => {
    response.statusCode = up ? 200 : 503;
    response.end('{}');
  });
  servers.push(server);

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(/** @type {import('node:net').AddressInfo} */ (server.address()).port);
    });
  });
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function runMobileLocal(env) {
  return runAsync(process.execPath, [path.join(repoRoot, 'scripts', 'run-mobile-local.mjs')], {
    cwd: repoRoot,
    timeoutMs: 50_000,
    env: { ...process.env, NO_COLOR: '1', ...env },
  });
}

/**
 * The variables of a `.env` pointing at a stack whose web server is on `port`.
 *
 * @param {number} port
 */
function stackAt(port) {
  return {
    RC_WEB_PORT: String(port),
    OIDC_ISSUER: `http://localhost:${String(port)}/realms/remote-claude`,
    OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
    OIDC_SCOPES: 'openid profile email offline_access',
  };
}

describe('run-mobile-local.mjs', () => {
  it('refuses a .env that cannot configure the app, naming the variable', async () => {
    const result = await runMobileLocal({ ...stackAt(1), OIDC_ISSUER: 'keycloak' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('the .env cannot configure the app');
    expect(result.stdout).toContain('OIDC_ISSUER is not a URL: "keycloak"');
    expect(result.stdout).not.toContain('starting the emulator');
  });

  it('refuses a web port that is not a port, rather than building against the default', async () => {
    const result = await runMobileLocal({ ...stackAt(1), RC_WEB_PORT: 'nope' });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('RC_WEB_PORT="nope" is not a valid TCP port');
  });

  it('says to start `pnpm dev` when the stack does not answer, before any device', async () => {
    const port = await fakeStack(false);

    const result = await runMobileLocal(stackAt(port));

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('backend');
    expect(result.stdout).toContain('did not answer');
    expect(result.stdout).toContain('pnpm dev');
    expect(result.stdout).not.toContain('starting the emulator');
    // Nothing was set up, so there is nothing to take back — and no teardown noise over the reason.
    expect(result.stdout).not.toContain('taking back');
  });

  it('says how to get Flutter when the stack is up but flutter is not on PATH', async () => {
    const port = await fakeStack(true);

    const result = await runMobileLocal({
      ...stackAt(port),
      PATH: path.join(repoRoot, 'no-such-directory'),
    });

    expect(result.code).toBe(1);
    // S-92 · the app's one origin: the health of the backend, through the web server.
    expect(result.stdout).toContain(`http://localhost:${String(port)}/api/health`);
    expect(result.stderr).toContain('flutter is not on PATH');
    expect(result.stdout).toContain('docs.flutter.dev');
    expect(result.stdout).not.toContain('starting the emulator');
  });
});
