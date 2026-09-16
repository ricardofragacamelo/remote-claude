import { describe, expect, it } from 'vitest';

import { checkCoverage, isExcluded, parseLcov } from '../../../scripts/lib/lcov.mjs';

/**
 * @param {string} file
 * @param {readonly number[]} hits one entry per measurable line
 */
function record(file, hits) {
  return [
    `SF:${file}`,
    ...hits.map((hit, index) => `DA:${String(index + 1)},${String(hit)}`),
    'end_of_record',
  ].join('\n');
}

describe('parseLcov', () => {
  it('reads the hits per line of each file', () => {
    const report = [record('lib/a.dart', [1, 0, 3]), record('lib/b.dart', [1, 1])].join('\n');

    expect(parseLcov(report)).toEqual([
      { file: 'lib/a.dart', covered: 2, total: 3, percent: (2 / 3) * 100 },
      { file: 'lib/b.dart', covered: 2, total: 2, percent: 100 },
    ]);
  });

  it('counts a file with no measurable line as covered rather than as zero', () => {
    expect(parseLcov(record('lib/empty.dart', []))[0]).toMatchObject({ total: 0, percent: 100 });
  });

  it('ignores a truncated report rather than inventing a file', () => {
    expect(parseLcov('SF:lib/a.dart\nDA:1,1')).toEqual([]);
    expect(parseLcov('')).toEqual([]);
  });
});

describe('isExcluded', () => {
  it('matches a suffix pattern at any depth', () => {
    expect(isExcluded('lib/a/b.g.dart', ['**/*.g.dart'])).toBe(true);
    expect(isExcluded('lib/a/b.dart', ['**/*.g.dart'])).toBe(false);
  });

  it('matches a directory prefix', () => {
    expect(isExcluded('lib/l10n/generated/x.dart', ['lib/l10n/generated/**'])).toBe(true);
    expect(isExcluded('lib/l10n/app_en.arb', ['lib/l10n/generated/**'])).toBe(false);
  });

  it('matches an exact path', () => {
    expect(isExcluded('lib/main.dart', ['lib/main.dart'])).toBe(true);
    expect(isExcluded('lib/other.dart', ['lib/main.dart'])).toBe(false);
  });
});

describe('checkCoverage', () => {
  // S-63 — a file below the bar in any dimension fails the gate.
  it('reports the file that is below the bar, whatever the rest is', () => {
    const report = [
      record(
        'lib/good.dart',
        Array.from({ length: 100 }, () => 1),
      ),
      record('lib/bad.dart', [1, 1, 1, 1, 1, 1, 1, 0, 0, 0]),
    ].join('\n');

    const verdict = checkCoverage(report, { minimum: 90, exclude: [] });

    expect(verdict.below.map((entry) => entry.file)).toEqual(['lib/bad.dart']);
    expect(verdict.overall).toBeGreaterThan(90);
  });

  it('sorts the failures worst first, so the worst one is the one on screen', () => {
    const report = [
      record('lib/mid.dart', [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]),
      record('lib/worst.dart', [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ].join('\n');

    expect(
      checkCoverage(report, { minimum: 90, exclude: [] }).below.map((entry) => entry.file),
    ).toEqual(['lib/worst.dart', 'lib/mid.dart']);
  });

  // S-66 — generated code does not count.
  it('leaves the excluded files out of the verdict entirely', () => {
    const report = [
      record('lib/protocol.g.dart', [0, 0, 0, 0]),
      record(
        'lib/real.dart',
        Array.from({ length: 10 }, () => 1),
      ),
    ].join('\n');

    const verdict = checkCoverage(report, { minimum: 90, exclude: ['**/*.g.dart'] });

    expect(verdict.measured.map((entry) => entry.file)).toEqual(['lib/real.dart']);
    expect(verdict.below).toEqual([]);
    expect(verdict.overall).toBe(100);
  });

  it('a file exactly at the bar passes', () => {
    const report = record('lib/edge.dart', [...Array.from({ length: 9 }, () => 1), 0]);

    expect(checkCoverage(report, { minimum: 90, exclude: [] }).below).toEqual([]);
  });

  it('an empty report is not a pass by accident — there is nothing below the bar', () => {
    expect(checkCoverage('', { minimum: 90, exclude: [] })).toEqual({
      measured: [],
      below: [],
      overall: 100,
    });
  });
});
