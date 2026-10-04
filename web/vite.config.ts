import fs from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { browserDefine, browserEnvironment, devServer } from './env';
import manifest from './package.json' with { type: 'json' };

// The repository `.env`, if there is one. The startup script exports it already; running
// `pnpm --filter web dev` on its own does not, and the defaults below are the documented ones.
const dotEnv = path.join(import.meta.dirname, '..', '.env');
if (fs.existsSync(dotEnv)) {
  process.loadEnvFile(dotEnv);
}

/** The dev server and its forwarding — locally, and behind the public origin of `pnpm dev:public`. */
const server = devServer(process.env);

/**
 * The dev server, the build, and the preview server.
 *
 * The port is the one the shared environment declares, so `pnpm dev` and an ephemeral e2e stack
 * can run side by side. `preview` needs its own entry — Vite does not read `server` for it — and
 * it is what the end-to-end suite runs against: a built bundle, not on-the-fly transforms.
 *
 * `strictPort` on both, because failing over to the next free port would silently serve the app
 * somewhere nothing is looking.
 */
export default defineConfig({
  plugins: [react(), tailwind(), tsconfigPaths()],
  define: browserDefine(browserEnvironment(process.env, manifest.version)),
  server,
  preview: { port: server.port, strictPort: true },
});
