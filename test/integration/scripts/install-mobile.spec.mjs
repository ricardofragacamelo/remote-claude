import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runAsync } from '../../../scripts/lib/exec.mjs';

// Each run spawns node, and some probe HTTP for seconds; the default 5 s is a unit-test budget.
vi.setConfig({ testTimeout: 60_000 });

/**
 * `pnpm mobile:install` as the terminal sees it, with an `adb` and a `flutter` of its own that log
 * every call — up to the point where the build would start (plan 10, B-36).
 *
 * Everything before the build is checked here: a run that cannot install has to say why and exit 1
 * **before** it spends minutes building. The build and the install themselves, with their failures,
 * are `buildAndInstall` in `test/unit/scripts/mobile-install.spec.mjs`, with the tools handed in —
 * a real build here would also stop the Gradle daemons of whatever else is building on the machine.
 *
 * Every variable the script reads is set here, so the outcome does not depend on the `.env` of the
 * machine running the suite: the environment wins over the file.
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
 * A stand-in for the web dev server of `pnpm dev`, answering every path with `status`.
 *
 * @param {number} status
 * @returns {Promise<number>} the port it listens on
 */
function fakeStack(status) {
  const server = http.createServer((_request, response) => {
    response.statusCode = status;
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
 * A machine of its own: an SDK whose `adb` lists [devices], a `flutter` on PATH unless [flutter] is
 * false, and the file both write every call to.
 *
 * @param {{ devices?: string, flutter?: boolean, adb?: boolean }} [options]
 */
function fakeMachine(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-install-'));
  const log = path.join(root, 'calls.log');
  const bin = path.join(root, 'bin');
  const tools = path.join(root, 'sdk', 'platform-tools');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  fs.writeFileSync(log, '');

  /**
   * @param {string} file
   * @param {string} body
   */
  const script = (file, body) => {
    fs.writeFileSync(file, `#!/bin/sh\necho "${path.basename(file)} $*" >> "${log}"\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };

  if (options.adb !== false) {
    script(
      path.join(tools, 'adb'),
      `[ "$1" = devices ] && printf '%s\\n' "List of devices attached" ${JSON.stringify(options.devices ?? '')}\nexit 0`,
    );
  }
  if (options.flutter !== false) {
    script(path.join(bin, 'flutter'), 'exit 0');
  }

  return {
    env: { ANDROID_HOME: path.join(root, 'sdk'), PATH: `${bin}:/usr/bin:/bin` },
    /** @returns {string[]} every call, in order */
    calls: () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

/** The `.env` of a stack on the local network, with the public origin written out. */
const DOT_ENV = {
  RC_WEB_PORT: '5173',
  OIDC_ISSUER: 'http://localhost:8180/realms/remote-claude',
  OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
  OIDC_SCOPES: 'openid profile email offline_access',
  RC_LAN_ADDRESS: '192.168.0.10',
  RC_INTERNAL_URL: '',
  RC_EXTERNAL_URL: 'https://name.ngrok-free.dev',
  RC_PUBLIC_URL: '',
};

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[]} [args]
 */
function install(env, args = []) {
  return runAsync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'install-mobile.mjs'), ...args],
    {
      cwd: repoRoot,
      timeoutMs: 50_000,
      env: { ...process.env, NO_COLOR: '1', ...DOT_ENV, ...env },
    },
  );
}

describe('install-mobile.mjs', () => {
  it('S-137 · --dry-run says each address and where it came from, and builds nothing', async () => {
    const machine = fakeMachine({ devices: 'R58M device usb:1-1 model:SM_G973F' });

    const result = await install(machine.env, ['--dry-run']);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(
      /internal\s+http:\/\/192\.168\.0\.10:5173\s+local network — RC_LAN_ADDRESS/,
    );
    expect(result.stdout).toMatch(
      /external\s+https:\/\/name\.ngrok-free\.dev\s+RC_EXTERNAL_URL in \.env/,
    );
    expect(result.stdout).toMatch(/realm\s+\/realms\/remote-claude/);
    expect(result.stdout).toContain('nothing was built or installed');
    expect(machine.calls()).toEqual([]);
  });

  it('refuses an argument it does not know, with the usage', async () => {
    const result = await install(fakeMachine().env, ['--release']);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('pnpm mobile:install');
  });

  it('S-129 · refuses an RC_LAN_ADDRESS off the private network before anything else', async () => {
    const machine = fakeMachine();

    const result = await install({ ...machine.env, RC_LAN_ADDRESS: '203.0.113.10' });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('RC_LAN_ADDRESS="203.0.113.10"');
    expect(machine.calls()).toEqual([]);
  });

  it('S-135 · refuses an external address that is not https, saying where it came from', async () => {
    const machine = fakeMachine();

    const result = await install({ ...machine.env, RC_EXTERNAL_URL: 'http://name.ngrok-free.dev' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('the .env cannot configure the app');
    expect(result.stdout).toContain('RC_EXTERNAL_URL in .env: "http://name.ngrok-free.dev"');
    expect(machine.calls()).toEqual([]);
  });

  it('S-139 · says how to get Flutter when it is not on PATH, before any phone', async () => {
    const port = await fakeStack(200);
    const machine = fakeMachine({ flutter: false });

    const result = await install({
      ...machine.env,
      RC_INTERNAL_URL: `http://127.0.0.1:${String(port)}`,
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(
      /internal\s+http:\/\/127\.0\.0\.1:\d+\s+RC_INTERNAL_URL in \.env/,
    );
    expect(result.stdout).toContain('the stack answers on the internal address');
    expect(result.stderr).toContain('flutter is not on PATH');
    expect(machine.calls()).toEqual([]);
  });

  it('S-139 · with no phone on USB — an emulator is not one — exits 1 before the build', async () => {
    const port = await fakeStack(200);
    const machine = fakeMachine({ devices: 'emulator-5554 device model:sdk_gphone64' });

    const result = await install({
      ...machine.env,
      RC_INTERNAL_URL: `http://127.0.0.1:${String(port)}`,
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toContain('no phone on USB');
    expect(result.stdout).toContain('USB debugging');
    expect(machine.calls()).toContain('adb devices -l');
    expect(machine.calls().some((call) => call.startsWith('flutter build'))).toBe(false);
  });

  it('S-139 · a phone that did not allow debugging is refused with what to do', async () => {
    const port = await fakeStack(503);
    const machine = fakeMachine({ devices: '0A1B unauthorized usb:1-2' });

    const result = await install({
      ...machine.env,
      RC_INTERNAL_URL: `http://127.0.0.1:${String(port)}`,
    });

    expect(result.code).toBe(1);
    // The stack not answering is said, never fatal: the app is installed for later.
    expect(result.stdout).toContain('the stack does not answer on the internal address');
    expect(result.stdout).toContain('0A1B is unauthorized');
    expect(result.stdout).toContain('Allow USB debugging');
    expect(machine.calls().some((call) => call.startsWith('flutter build'))).toBe(false);
  });

  it('S-139 · says where it looked when the SDK has no adb', async () => {
    const port = await fakeStack(200);
    const machine = fakeMachine({ adb: false });

    const result = await install({
      ...machine.env,
      RC_INTERNAL_URL: `http://127.0.0.1:${String(port)}`,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('adb is not where the Android SDK should be');
    expect(result.stdout).toContain(path.join('sdk', 'platform-tools', 'adb'));
  });
});
