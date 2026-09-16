/**
 * The coverage bar, read from an `lcov.info`.
 *
 * Used for the Flutter module. The two TypeScript workspaces let Vitest enforce the same bar
 * with `thresholds.perFile`; Dart has no such option, and `flutter test --coverage` only writes
 * a report — somebody has to read it, or the number is decoration.
 *
 * **What Dart's lcov carries, and what it does not.** `package:coverage` emits `DA` records
 * only: hits per line. There is no `BRDA` and no `FN`, so `branches` and `functions` cannot be
 * measured on this end — the bar here is **lines**, and the gap is recorded in the plan rather
 * than papered over. See docs/architecture/shared/06-testing-strategy.md#cobertura.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {object} FileCoverage
 * @property {string} file path as the report spells it
 * @property {number} covered lines hit
 * @property {number} total lines that could be hit
 * @property {number} percent 0-100; a file with no measurable line counts as 100
 */

/**
 * Reads an lcov report.
 *
 * @param {string} report contents of an `lcov.info`
 * @returns {FileCoverage[]}
 */
export function parseLcov(report) {
  /** @type {FileCoverage[]} */
  const files = [];
  /** @type {string | null} */
  let file = null;
  let covered = 0;
  let total = 0;

  for (const raw of report.split('\n')) {
    const entry = raw.trim();

    if (entry.startsWith('SF:')) {
      file = entry.slice(3);
      covered = 0;
      total = 0;
      continue;
    }

    if (entry.startsWith('DA:')) {
      const [, hits] = entry.slice(3).split(',');
      total += 1;
      if (hits !== undefined && Number(hits) > 0) {
        covered += 1;
      }
      continue;
    }

    if (entry === 'end_of_record' && file !== null) {
      files.push({ file, covered, total, percent: total === 0 ? 100 : (covered / total) * 100 });
      file = null;
    }
  }

  return files;
}

/**
 * Whether a path matches one of the exclusion globs.
 *
 * Only the two shapes the exclusion list uses are supported — a `**` prefix and a `/**` suffix —
 * because a full glob engine here would be a dependency for four patterns.
 *
 * @param {string} file
 * @param {readonly string[]} patterns
 * @returns {boolean}
 */
export function isExcluded(file, patterns) {
  return patterns.some((pattern) => {
    if (pattern.startsWith('**/')) {
      const suffix = pattern.slice(3);
      return file === suffix || file.endsWith(`/${suffix}`) || matchesTail(file, suffix);
    }

    if (pattern.endsWith('/**')) {
      return file.startsWith(pattern.slice(0, -2));
    }

    return file === pattern;
  });
}

/**
 * @param {string} file
 * @param {string} suffix pattern tail, which may itself start with `*`
 * @returns {boolean}
 */
function matchesTail(file, suffix) {
  return suffix.startsWith('*') ? file.endsWith(suffix.slice(1)) : false;
}

/**
 * @typedef {object} CoverageVerdict
 * @property {FileCoverage[]} measured files the bar applies to
 * @property {FileCoverage[]} below files under the bar, worst first
 * @property {number} overall percentage over every measured line
 */

/**
 * Applies the bar to a report.
 *
 * @param {string} report contents of an `lcov.info`
 * @param {{ minimum: number, exclude: readonly string[] }} options
 * @returns {CoverageVerdict}
 */
export function checkCoverage(report, options) {
  const measured = parseLcov(report).filter((entry) => !isExcluded(entry.file, options.exclude));
  const below = measured
    .filter((entry) => entry.percent < options.minimum)
    .sort((left, right) => left.percent - right.percent);

  const total = measured.reduce((sum, entry) => sum + entry.total, 0);
  const covered = measured.reduce((sum, entry) => sum + entry.covered, 0);

  return { measured, below, overall: total === 0 ? 100 : (covered / total) * 100 };
}

/**
 * Reads a report from disk.
 *
 * @param {string} file absolute path of the `lcov.info`
 * @returns {string | null} `null` when the report does not exist
 */
export function readReport(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/**
 * Where a module's lcov report lands.
 *
 * @param {string} moduleDir
 * @returns {string}
 */
export function reportPathOf(moduleDir) {
  return path.join(moduleDir, 'coverage', 'lcov.info');
}
