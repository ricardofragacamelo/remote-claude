#!/usr/bin/env node
/**
 * Records what `osv-scanner` answers for the lockfiles under `test/fixtures/osv/`.
 *
 * The suite of `scripts/lib/osv.mjs` reads those recordings instead of running the scanner: a
 * unit test that needs the network and a live advisory database is a unit test that fails on a
 * plane. What it cannot do is notice the scanner changing what it prints — re-recording is how,
 * after bumping `OSV_IMAGE`, and the suite then says whether the reading still holds.
 *
 * The boundary lockfile holds one package three times: below an advisory's range, exactly at its
 * `introduced` version, and at its `fixed` one (S-34). The clean one holds only the last.
 *
 * Usage: `node scripts/record-osv-fixtures.mjs`
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { commandExists, run } from './lib/exec.mjs';
import { OSV_IMAGE, osvInvocation } from './lib/osv.mjs';
import { repoRoot } from './lib/paths.mjs';
import { fail, ok, title } from './lib/ui.mjs';

const FIXTURES = path.join(repoRoot, 'test', 'fixtures', 'osv');

/** @returns {number} */
function main() {
  title('osv-scanner — recording the fixtures');
  const hasBinary = commandExists('osv-scanner');

  for (const name of ['boundary', 'clean']) {
    const invocation = osvInvocation({
      hasBinary,
      root: FIXTURES,
      lockfiles: [`package-lock.json:${name}.package-lock.json`],
    });
    const result = run(invocation.command, invocation.args, { timeoutMs: 300_000 });

    let stdout;
    try {
      stdout = JSON.parse(result.stdout);
    } catch {
      fail(`${name}: the scanner answered no report`, `exit ${String(result.code)}`);
      return 1;
    }

    const recording = {
      recordedWith: hasBinary ? 'osv-scanner (local binary)' : OSV_IMAGE,
      exitCode: result.code,
      stdout,
      stderr: result.stderr,
    };
    fs.writeFileSync(
      path.join(FIXTURES, `${name}.json`),
      `${JSON.stringify(recording, null, 2)}\n`,
      'utf8',
    );
    ok(`${name}.json`, `exit ${String(result.code)}`);
  }

  return 0;
}

process.exitCode = main();
