/**
 * A Vite dev server with the configuration of `web/env.ts`, as a process of its own — the public
 * one when `RC_PUBLIC_URL` is set, the local one when it is empty.
 *
 * The suite runs in jsdom, and esbuild refuses to start inside it (jsdom's `TextEncoder` is not the
 * platform's). Out here it is plain Node, which strips the types of `env.ts` on import, and the
 * test only talks HTTP to it — which is all the tunnel ever does too.
 *
 * Usage: `node public-dev-server.mjs <root>`, with `RC_PUBLIC_URL` (empty for the local mode),
 * `RC_BACKEND_PORT` and `RC_KEYCLOAK_PORT` set. Prints `listening <port>` once it answers, and closes on SIGTERM.
 */

import net from 'node:net';
import process from 'node:process';

import { createServer } from 'vite';

import { devServer } from '../../env.ts';

const root = process.argv[2];
if (root === undefined) {
  process.stderr.write('usage: node public-dev-server.mjs <root>\n');
  process.exit(2);
}

/**
 * A port nobody listens on. Vite reads a port of 0 as "not set" and falls back to 5173 — the one
 * `pnpm dev` holds while somebody works — so the system is asked first, and Vite is given its answer.
 */
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {net.AddressInfo} */ (probe.address());
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const server = await createServer({
  configFile: false,
  root,
  logLevel: 'silent',
  // HMR is the browser's business, not this suite's.
  server: {
    ...devServer({ ...process.env, RC_WEB_PORT: String(await freePort()) }),
    host: '127.0.0.1',
    hmr: false,
  },
});
await server.listen();

const address = server.httpServer?.address();
process.stdout.write(`listening ${String(typeof address === 'object' ? address?.port : '')}\n`);

process.on('SIGTERM', () => {
  void server.close().then(() => process.exit(0));
});
