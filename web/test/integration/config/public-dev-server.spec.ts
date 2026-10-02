import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The dev server of `pnpm dev:public`, for real (plan 20, B-05).
 *
 * A Vite server with the public configuration, in front of a stand-in backend and identity
 * provider that record what reaches them. The server runs in a process of its own
 * (`test/support/public-dev-server.mjs`): esbuild does not start inside jsdom. What is checked is what only the real forwarder shows:
 * the prefix gone, the refresh cookie moved under it, the WebSocket upgraded, the realm reached,
 * the admin console not — and the `Host` check that lets the tunnel's host in and nobody else.
 */

const PUBLIC_HOST = 'name.ngrok-free.dev';

/** What reached each stand-in, as `METHOD url host`. */
const seen: { backend: string[]; keycloak: string[] } = { backend: [], keycloak: [] };

let backend: http.Server;
let keycloak: http.Server;
let vite: ChildProcess;
let viteUrl: string;
let root: string;

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

/** A request through the dev server, as the tunnel would send it unless told otherwise. */
async function through(
  pathname: string,
  host = PUBLIC_HOST,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(`${viteUrl}${pathname}`, { headers: { host } }, (response) => {
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
    seen.keycloak.push(`${String(request.method)} ${String(request.url)}`);
    response.end('keycloak');
  });

  const backendPort = await listen(backend);
  const keycloakPort = await listen(keycloak);

  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-public-vite-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>app</title>');

  const script = path.join(import.meta.dirname, '..', '..', 'support', 'public-dev-server.mjs');
  vite = spawn(process.execPath, [script, root], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      RC_PUBLIC_URL: `https://${PUBLIC_HOST}`,
      RC_BACKEND_PORT: String(backendPort),
      RC_KEYCLOAK_PORT: String(keycloakPort),
    },
  });

  const port = await new Promise<string>((resolve, reject) => {
    vite.on('exit', (code) => {
      reject(new Error(`the dev server exited with ${String(code)} before it listened`));
    });
    readline.createInterface({ input: vite.stdout as NodeJS.ReadableStream }).on('line', (line) => {
      const match = /^listening (\d+)$/.exec(line);
      if (match?.[1] !== undefined) {
        resolve(match[1]);
      }
    });
  });
  viteUrl = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  const exited = new Promise((resolve) => vite.once('exit', resolve));
  vite.kill('SIGTERM');
  await exited;
  await close(backend);
  await close(keycloak);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the public dev server', () => {
  it('forwards the API without its prefix, and moves the refresh cookie under it (S-32)', async () => {
    const response = await through('/api/auth/refresh?x=1');

    expect(response.body).toBe('backend');
    expect(seen.backend).toContain(`GET /auth/refresh?x=1 ${PUBLIC_HOST}`);
    expect(String(response.headers['set-cookie'])).toContain('Path=/api/auth');
  });

  it('upgrades the WebSocket on the backend (S-32)', async () => {
    const upgraded = await new Promise<number>((resolve, reject) => {
      const request = http.request(`${viteUrl}/ws`, {
        headers: {
          host: PUBLIC_HOST,
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

    expect(upgraded).toBe(101);
    expect(seen.backend).toContain('UPGRADE /ws');
  });

  it('forwards the realm and the theme files to the identity provider (S-32)', async () => {
    expect((await through('/realms/remote-claude/.well-known/openid-configuration')).body).toBe(
      'keycloak',
    );
    expect((await through('/resources/abc/login/keycloak.v2/css/styles.css')).body).toBe(
      'keycloak',
    );
  });

  it('keeps the admin console off the tunnel (S-31)', async () => {
    const response = await through('/admin/master/console/');

    expect(response.body).not.toBe('keycloak');
    expect(seen.keycloak.some((entry) => entry.includes('/admin'))).toBe(false);
  });

  it('serves the app for everything else, on the public host and on localhost', async () => {
    expect((await through('/')).body).toContain('<title>app</title>');
    expect((await through('/', 'localhost')).status).toBe(200);
  });

  it('refuses a host that is neither the public one nor this machine (S-33)', async () => {
    expect((await through('/', 'attacker.example')).status).toBe(403);
  });
});
