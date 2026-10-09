/**
 * The `mermaid.min.js` of the app, copied from the web's (plan 25, D-20, ADR-024).
 *
 * The app draws Mermaid with the same engine as the web, in a WebView off screen. The version is
 * the web's — what `pnpm-lock.yaml` installed under `web/node_modules/mermaid` — and the file is
 * copied next to the page of the app (`mobile/assets/mermaid/`, out of git) before every build of
 * the app. The exact version is written here as well: a web that moved to another Mermaid stops
 * the app's build rather than changing its diagrams in silence (R-12), and the two move together.
 */

import fs from 'node:fs';
import path from 'node:path';

import { fatal, ok } from './ui.mjs';

/** The Mermaid both clients draw with — the same as `web/package.json` resolves to. */
export const MERMAID_VERSION = '12.1.0';

/**
 * Where the file comes from and where it goes.
 *
 * @param {string} root the repository
 */
export function mermaidAssetPaths(root) {
  const installed = path.join(root, 'web', 'node_modules', 'mermaid');
  return {
    manifest: path.join(installed, 'package.json'),
    source: path.join(installed, 'dist', 'mermaid.min.js'),
    target: path.join(root, 'mobile', 'assets', 'mermaid', 'mermaid.min.js'),
  };
}

/**
 * @typedef {{ state: 'copied' | 'current', version: string }
 *   | { state: 'missing', reason: string }
 *   | { state: 'mismatch', installed: string, expected: string }} MermaidSync
 */

/**
 * Copies the web's `mermaid.min.js` into the app, when it is the exact version and the app's copy
 * differs. Never throws for an expected problem: the caller says it and stops.
 *
 * @param {string} root the repository
 * @param {string} [expected] the version the app draws with
 * @returns {MermaidSync}
 */
export function syncMermaidAsset(root, expected = MERMAID_VERSION) {
  const { manifest, source, target } = mermaidAssetPaths(root);

  if (!fs.existsSync(manifest) || !fs.existsSync(source)) {
    return { state: 'missing', reason: `${path.relative(root, source)} is not there` };
  }

  const installed = String(JSON.parse(fs.readFileSync(manifest, 'utf8')).version ?? '');
  if (installed !== expected) {
    return { state: 'mismatch', installed, expected };
  }

  const bytes = fs.readFileSync(source);
  if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) {
    return { state: 'current', version: installed };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return { state: 'copied', version: installed };
}

/**
 * What a script that builds the app says of [sync], and whether it may go on.
 *
 * @param {MermaidSync} sync
 * @returns {{ ok: boolean, message: string }}
 */
export function describeMermaidSync(sync) {
  switch (sync.state) {
    case 'copied':
      return { ok: true, message: `mermaid ${sync.version} copied into the app` };
    case 'current':
      return { ok: true, message: `mermaid ${sync.version} already in the app` };
    case 'missing':
      return {
        ok: false,
        message: `mermaid is not installed for the web: ${sync.reason} — run \`pnpm install\``,
      };
    default:
      return {
        ok: false,
        message: `the web has mermaid ${sync.installed}, the app draws with ${sync.expected} — move both together (plan 25, D-20)`,
      };
  }
}

/**
 * Copies the file before a build of the app, saying what happened — `false` when the build must
 * not go on.
 *
 * @param {string} root the repository
 * @returns {boolean}
 */
export function prepareMermaid(root) {
  const { ok: good, message } = describeMermaidSync(syncMermaidAsset(root));
  if (good) {
    ok(message);
  } else {
    fatal(message);
  }
  return good;
}
