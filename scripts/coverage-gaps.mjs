#!/usr/bin/env node
/**
 * What the last coverage run of a module never reached, file by file: the lines, the functions and
 * the lines with a branch never taken — so the test to write next is named, not guessed.
 *
 * Reads the `coverage/lcov.info` the module's `test:coverage` left; it runs nothing.
 *
 * Usage: `node scripts/coverage-gaps.mjs <web|backend> [part of a path]`
 */

import path from 'node:path';
import process from 'node:process';

import { asRanges, gapsOf, readReport, reportPathOf } from './lib/lcov.mjs';
import { repoRoot } from './lib/paths.mjs';
import { bold, dim, fatal, hint, line, ok, title } from './lib/ui.mjs';

const MODULES = new Set(['web', 'backend']);

function main() {
  const [module = '', filter = ''] = process.argv.slice(2);

  if (!MODULES.has(module)) {
    fatal('usage: node scripts/coverage-gaps.mjs <web|backend> [part of a path]');
    process.exitCode = 2;
    return;
  }

  const report = readReport(reportPathOf(path.join(repoRoot, module)));
  if (report === null) {
    fatal(`no coverage report in ${module}/coverage`);
    hint(`run \`pnpm --filter ${module} run test:coverage\` first`);
    process.exitCode = 1;
    return;
  }

  title(`coverage gaps · ${module}`);
  const gaps = gapsOf(report).filter((each) => each.file.includes(filter));

  if (gaps.length === 0) {
    ok('nothing left unreached', filter === '' ? undefined : `matching "${filter}"`);
    return;
  }

  for (const each of gaps) {
    printGaps(module, each);
  }
}

/**
 * @param {string} module
 * @param {import('./lib/lcov.mjs').CoverageGaps} gaps
 */
function printGaps(module, gaps) {
  const root = path.join(repoRoot, module);
  line(bold(path.relative(root, path.resolve(root, gaps.file))));

  if (gaps.lines.length > 0) {
    line(`  lines     ${asRanges(gaps.lines)}`);
  }
  if (gaps.functions.length > 0) {
    line(`  functions ${gaps.functions.map((fn) => `${fn.name}:${String(fn.line)}`).join(', ')}`);
  }
  if (gaps.branches.length > 0) {
    line(`  branches  ${dim(asRanges(gaps.branches))}`);
  }
}

main();
