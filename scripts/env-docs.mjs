#!/usr/bin/env node
/**
 * Generates the human-readable catalogue of every environment variable — one table per section,
 * built from the comments already above each one in `.env.example` — and, with `--check`, fails
 * when the committed doc is out of sync with it.
 *
 * It exists so the explanation stays in exactly one place to write (the comment in
 * `.env.example`, already required by `test/unit/env-example.spec.mjs`) while still having a
 * doc somebody can read without opening a dotfile.
 *
 * Usage: `pnpm env:docs` · `pnpm env:docs:check`
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import { renderEnvironmentDoc } from './lib/env-example.mjs';
import { dim, fail, hint, line, ok, title } from './lib/ui.mjs';

const check = process.argv.includes('--check');
const DOC_PATH = 'docs/architecture/shared/13-environment-variables.md';

function main() {
  title(`env-docs — ${check ? 'check' : 'generate'}`);

  const examplePath = path.join(repoRoot, '.env.example');
  const docPath = path.join(repoRoot, DOC_PATH);
  const generated = renderEnvironmentDoc(fs.readFileSync(examplePath, 'utf8'));

  if (!check) {
    fs.writeFileSync(docPath, generated);
    ok(DOC_PATH, 'written');
    line(dim('commit it alongside the .env.example change that produced it'));
    return 0;
  }

  const committed = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : null;

  if (committed === generated) {
    ok(DOC_PATH, 'in sync with .env.example');
    return 0;
  }

  fail(DOC_PATH, 'out of sync with .env.example');
  hint('run `pnpm env:docs` and commit what it writes');
  return 1;
}

process.exitCode = main();
