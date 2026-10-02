#!/usr/bin/env node
/**
 * Builds the web in memory and checks how the editor ships (plan 07, D-09, S-204): Monaco only in
 * chunks a dynamic import reaches, its worker emitted by our build, no file naming a CDN — and says
 * how much each part weighs, gzipped, which is the measure D-09 records.
 *
 * Nothing is written to `web/dist`.
 *
 * Usage: `node scripts/editor-bundle.mjs` · `--json` prints the analysis for a test to read
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

import { analyseEditorBundle, editorBundleProblems } from './lib/editor-bundle.mjs';
import { repoRoot } from './lib/paths.mjs';
import { dim, fail, line, ok, title } from './lib/ui.mjs';

const web = path.join(repoRoot, 'web');

/** Vite as the web resolves it — the root has none of its own. */
async function vite() {
  const require = createRequire(path.join(web, 'package.json'));
  return import(pathToFileURL(require.resolve('vite')).href);
}

async function main() {
  const json = process.argv.includes('--json');
  const { build } = await vite();
  const result = await build({
    root: web,
    configFile: path.join(web, 'vite.config.ts'),
    logLevel: 'silent',
    build: { write: false, reportCompressedSize: false },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((each) => each.output ?? []);
  const bundle = analyseEditorBundle(output);
  const problems = editorBundleProblems(bundle);
  /** @param {string} name */
  const gzipped = (name) => {
    const file = output.find((each) => each.fileName === name);
    const body = file?.type === 'chunk' ? file.code : (file?.source ?? '');
    return gzipSync(body).length;
  };
  const sizes = Object.fromEntries(
    [...bundle.lazyChunks, ...(bundle.worker === null ? [] : [bundle.worker])].map((name) => [
      name,
      gzipped(name),
    ]),
  );

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...bundle, problems, gzipBytes: sizes })}\n`);
    return problems.length === 0 ? 0 : 1;
  }

  title('editor-bundle');
  for (const [name, bytes] of Object.entries(sizes)) {
    line(dim(`${name} · ${(bytes / 1024).toFixed(1)} kB gzip`));
  }

  if (problems.length === 0) {
    ok('the editor is its own chunk', 'loaded on demand, its worker ours, no CDN');
    return 0;
  }

  for (const problem of problems) {
    fail(problem);
  }
  return 1;
}

process.exitCode = await main();
