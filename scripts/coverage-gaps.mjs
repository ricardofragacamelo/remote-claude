#!/usr/bin/env node
/**
 * What the last coverage run of a module never reached, file by file: the lines, the functions and
 * the lines with a branch never taken — so the test to write next is named, not guessed.
 *
 * Reads the `coverage/lcov.info` the module's `test:coverage` left; it runs nothing. Dart's report
 * has lines only, so for `mobile` the functions and branches never show. `--from <dir>` reads the
 * report of a copy of the module — a phase staged outside the tree while `pnpm verify` runs.
 *
 * Usage: `node scripts/coverage-gaps.mjs <web|backend|mobile> [part of a path] [--from <dir>]`
 */

import path from 'node:path';
import process from 'node:process';

import { MOBILE_COVERAGE_EXCLUSIONS } from './lib/coverage.mjs';
import { asRanges, gapsOf, isExcluded, readReport, reportPathOf } from './lib/lcov.mjs';
import { repoRoot } from './lib/paths.mjs';
import { bold, dim, fatal, hint, line, ok, title } from './lib/ui.mjs';

const MODULES = new Set(['web', 'backend', 'mobile']);

function main() {
  const asked = parseArgs(process.argv.slice(2));

  if (asked === null) {
    fatal(
      'usage: node scripts/coverage-gaps.mjs <web|backend|mobile> [part of a path] [--from <dir>]',
    );
    process.exitCode = 2;
    return;
  }

  const { module, filter, root } = asked;
  const report = readReport(reportPathOf(root));
  if (report === null) {
    fatal(`no coverage report in ${path.relative(repoRoot, root) || root}/coverage`);
    hint(howToMeasure(module));
    process.exitCode = 1;
    return;
  }

  title(`coverage gaps · ${module}`);
  const excluded = module === 'mobile' ? MOBILE_COVERAGE_EXCLUSIONS : [];
  const gaps = gapsOf(report).filter(
    (each) => each.file.includes(filter) && !isExcluded(each.file, excluded),
  );

  if (gaps.length === 0) {
    ok('nothing left unreached', filter === '' ? undefined : `matching "${filter}"`);
    return;
  }

  for (const each of gaps) {
    printGaps(root, each);
  }
}

/**
 * The module, the filter and the directory whose report is read — `null` when the arguments are
 * not a request this script understands.
 *
 * @param {string[]} args
 * @returns {{ module: string, filter: string, root: string } | null}
 */
function parseArgs(args) {
  const from = args.indexOf('--from');
  const copy = from === -1 ? undefined : args.splice(from, 2)[1];
  const [module = '', filter = ''] = args;

  if (!MODULES.has(module) || (from !== -1 && copy === undefined)) {
    return null;
  }
  return {
    module,
    filter,
    root: copy === undefined ? path.join(repoRoot, module) : path.resolve(copy),
  };
}

/** @param {string} module */
function howToMeasure(module) {
  return module === 'mobile'
    ? 'run `flutter test --coverage` in it first'
    : `run \`pnpm --filter ${module} run test:coverage\` first`;
}

/**
 * @param {string} root the module's directory, or its copy's
 * @param {import('./lib/lcov.mjs').CoverageGaps} gaps
 */
function printGaps(root, gaps) {
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
