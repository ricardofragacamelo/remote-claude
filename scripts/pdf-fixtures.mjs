#!/usr/bin/env node
/**
 * Writes the PDFs the reader of plan 21 is tested with into `e2e/fixtures/files/`, or checks that
 * the versioned ones are still what this script writes (21 · D-03, S-05).
 *
 * They are written by hand — PDF syntax, the standard Helvetica, a cipher of our own for the locked
 * copy — so nothing outside Node is needed and the same run gives the same bytes. The suites only
 * read the versioned files; `--check` is what keeps them honest.
 *
 * Usage:
 *   node scripts/pdf-fixtures.mjs           # (re)writes them
 *   node scripts/pdf-fixtures.mjs --check   # exit 1 when a versioned one differs
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { divergentFixtures, pdfFixtures } from './lib/pdf-fixtures.mjs';
import { repoRoot } from './lib/paths.mjs';
import { fail, hint, ok, title } from './lib/ui.mjs';

const directory = path.join(repoRoot, 'e2e', 'fixtures', 'files');
const fixtures = pdfFixtures();

/** @param {string} name */
function onDisk(name) {
  const file = path.join(directory, name);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

if (process.argv.includes('--check')) {
  title('PDF fixtures — check');
  const divergent = divergentFixtures(fixtures, onDisk);

  for (const name of Object.keys(fixtures)) {
    if (divergent.includes(name)) {
      fail(name, 'is not what the script writes');
    } else {
      ok(name);
    }
  }

  if (divergent.length > 0) {
    hint('run `node scripts/pdf-fixtures.mjs` and commit the files it writes');
    process.exit(1);
  }
} else {
  title('PDF fixtures');
  fs.mkdirSync(directory, { recursive: true });

  for (const [name, bytes] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(directory, name), bytes);
    ok(name, `${bytes.length} bytes`);
  }
}
