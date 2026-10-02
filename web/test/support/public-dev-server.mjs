/**
 * A Vite dev server with the public configuration of `web/env.ts`, as a process of its own.
 *
 * The suite runs in jsdom, and esbuild refuses to start inside it (jsdom's `TextEncoder` is not the
 * platform's). Out here it is plain Node, which strips the types of `env.ts` on import, and the
 * test only talks HTTP to it — which is all the tunnel ever does too.
 *
 * Usage: `node public-dev-server.mjs <root>`, with `RC_PUBLIC_URL`, `RC_BACKEND_PORT` and
 * `RC_KEYCLOAK_PORT` set. Prints `listening <port>` once it answers, and closes on SIGTERM.
 */

import process from 'node:process';

import { createServer } from 'vite';

import { devServer } from '../../env.ts';

const root = process.argv[2];
if (root === undefined) {
  process.stderr.write('usage: node public-dev-server.mjs <root>\n');
  process.exit(2);
}

const server = await createServer({
  configFile: false,
  root,
  logLevel: 'silent',
  // Port 0 asks the system for any free one; HMR is the browser's business, not this suite's.
  server: { ...devServer({ ...process.env, RC_WEB_PORT: '0' }), host: '127.0.0.1', hmr: false },
});
await server.listen();

const address = server.httpServer?.address();
process.stdout.write(`listening ${String(typeof address === 'object' ? address?.port : '')}\n`);

process.on('SIGTERM', () => {
  void server.close().then(() => process.exit(0));
});
