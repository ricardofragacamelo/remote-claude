import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The dev server of `pnpm dev:public` and of `pnpm dev`, for real (plan 20, B-05; plan 10, B-27).
 *
 * A Vite server in front of a stand-in backend and identity provider that record what reaches
 * them — once with the public configuration, once with the local one. The servers run in processes
 * of their own (`test/support/public-dev-server.mjs`): esbuild does not start inside jsdom. What is
 * checked is what only the real forwarder shows: the prefix gone, the refresh cookie moved under
 * it, the WebSocket upgraded, the realm reached, the admin console not — in both modes, since the
 * phone reaches the local stack through the web's origin too (plan 10, D-16) — and the `Host` check
 * that lets the tunnel's host in only in public mode.
 */

const PUBLIC_HOST = 'name.ngrok-free.dev';

/** What reached each stand-in, as `METHOD url host`. */
const seen: { backend: string[]; keycloak: string[] } = { backend: [], keycloak: [] };

let backend: http.Server;
let keycloak: http.Server;
let root: string;

/** One dev server, as a process of its own. */
interface Forwarder {
  readonly proc: ChildProcess;
  readonly url: string;
}

/** The public dev server and the local one, both in front of the same stand-ins. */
const forwarders: { public?: Forwarder; local?: Forwarder } = {};

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  return (server.address() as AddressInfo).port;
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

/** The address of a started dev server. */
function urlOf(mode: keyof typeof forwarders): string {
  const forwarder = forwarders[mode];
  if (forwarder === undefined) {
    throw new Error(`the ${mode} dev server did not start`);
  }
  return forwarder.url;
}

/** A request through a dev server, with the `Host` the tunnel (or the phone) would send. */
async function through(
  mode: keyof typeof forwarders,
  pathname: string,
  host: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(`${urlOf(mode)}${pathname}`, { headers: { host } }, (response) => {
      let body = '';
      response.on('data', (chunk) => (body += String(chunk)));
      response.on('end', () => {
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

/** Starts a dev server with the given environment, and resolves once it listens. */
async function startForwarder(env: Record<string, string>): Promise<Forwarder> {
  const script = path.join(import.meta.dirname, '..', '..', 'support', 'public-dev-server.mjs');
  const proc = spawn(process.execPath, [script, root], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env },
  });

  const port = await new Promise<string>((resolve, reject) => {
    proc.on('exit', (code) => {
      reject(new Error(`the dev server exited with ${String(code)} before it listened`));
    });
    readline.createInterface({ input: proc.stdout as NodeJS.ReadableStream }).on('line', (line) => {
      const match = /^listening (\d+)$/.exec(line);
      if (match?.[1] !== undefined) {
        resolve(match[1]);
      }
    });
  });

  return { proc, url: `http://127.0.0.1:${port}` };
}

/** Stops a dev server and waits for it to be gone. */
async function stopForwarder(forwarder: Forwarder | undefined): Promise<void> {
  if (forwarder === undefined) {
    return;
  }
  const exited = new Promise((resolve) => forwarder.proc.once('exit', resolve));
  forwarder.proc.kill('SIGTERM');
  await exited;
}

beforeAll(async () => {
  backend = http.createServer((request, response) => {
    seen.backend.push(
      `${String(request.method)} ${String(request.url)} ${String(request.headers.host)}`,
    );
    response.setHeader(
      'set-cookie',
      'rc_refresh=abc; Path=/auth; HttpOnly; Secure; SameSite=Strict',
    );
    response.end('backend');
  });
  // The gateway's handshake, by hand: what matters is that the upgrade reaches the backend.
  backend.on('upgrade', (request, socket) => {
    seen.backend.push(`UPGRADE ${String(request.url)}`);
    socket.end(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
  });
  keycloak = http.createServer((request, response) => {
    seen.keycloak.push(
      `${String(request.method)} ${String(request.url)} ${String(request.headers.host)}`,
    );
    response.end('keycloak');
  });

  const backendPort = await listen(backend);
  const keycloakPort = await listen(keycloak);

  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-public-vite-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>app</title>');

  const env = { RC_BACKEND_PORT: String(backendPort), RC_KEYCLOAK_PORT: String(keycloakPort) };
  [forwarders.public, forwarders.local] = await Promise.all([
    startForwarder({ ...env, RC_PUBLIC_URL: `https://${PUBLIC_HOST}` }),
    startForwarder({ ...env, RC_PUBLIC_URL: '' }),
  ]);
}, 60_000);

afterAll(async () => {
  await Promise.all([stopForwarder(forwarders.public), stopForwarder(forwarders.local)]);
  await close(backend);
  await close(keycloak);
  fs.rmSync(root, { recursive: true, force: true });
});

/** An upgrade through a dev server, answered with the status the backend's handshake sent. */
async function upgrade(mode: keyof typeof forwarders, host: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const request = http.request(`${urlOf(mode)}/ws`, {
      headers: {
        host,
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        // The sample nonce of RFC 6455, §1.3 — any 16 bytes in base64 will do for the handshake.
        'sec-websocket-key': Buffer.from('the sample nonce').toString('base64'),
      },
    });
    request.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    request.on('error', reject);
    request.end();
  });
}

describe.each([
  // The tunnel sends the public host (plan 20, S-31…S-33).
  ['public', PUBLIC_HOST],
  // The phone, through `adb reverse`, and the browser send `localhost` (plan 10, S-91).
  ['local', 'localhost:5173'],
] as const)('the %s dev server', (mode, host) => {
  it('forwards the API without its prefix, and moves the refresh cookie under it (S-32, S-91)', async () => {
    const response = await through(mode, '/api/auth/refresh?x=1', host);

    expect(response.body).toBe('backend');
    expect(seen.backend).toContain(`GET /auth/refresh?x=1 ${host}`);
    expect(String(response.headers['set-cookie'])).toContain('Path=/api/auth');
  });

  it('upgrades the WebSocket on the backend (S-32, S-91)', async () => {
    seen.backend.length = 0;

    expect(await upgrade(mode, host)).toBe(101);
    expect(seen.backend).toContain('UPGRADE /ws');
  });

  it('forwards the realm and the theme files to the identity provider, Host untouched (S-32, S-91)', async () => {
    seen.keycloak.length = 0;

    expect(
      (await through(mode, '/realms/remote-claude/.well-known/openid-configuration', host)).body,
    ).toBe('keycloak');
    expect(
      (await through(mode, '/resources/abc/login/keycloak.v2/css/styles.css', host)).body,
    ).toBe('keycloak');
    // The provider writes the origin it was called through into `iss` (plan 10, B-25): the Host
    // reaching it has to be the client's, never rewritten to the provider's own.
    expect(seen.keycloak).toContain(
      `GET /realms/remote-claude/.well-known/openid-configuration ${host}`,
    );
  });

  it('keeps the admin console out (S-31, S-91)', async () => {
    const response = await through(mode, '/admin/master/console/', host);

    expect(response.body).not.toBe('keycloak');
    expect(seen.keycloak.some((entry) => entry.includes('/admin'))).toBe(false);
  });

  it('serves the app for everything else, on its host and on localhost', async () => {
    expect((await through(mode, '/', host)).body).toContain('<title>app</title>');
    expect((await through(mode, '/', 'localhost')).status).toBe(200);
  });

  it('refuses a host that is neither its own nor this machine (S-33)', async () => {
    expect((await through(mode, '/', 'attacker.example')).status).toBe(403);
  });
});

describe('the local dev server', () => {
  it('does not let the tunnel host in when there is no tunnel (D-02)', async () => {
    expect((await through('local', '/', PUBLIC_HOST)).status).toBe(403);
  });
});
