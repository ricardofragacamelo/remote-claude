import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { runGateList } from '../../../scripts/lib/gates.mjs';
import { reportVerdict } from '../../../scripts/lib/verify.mjs';

// Each gate spawns a real process; the default 5 s is a budget for pure functions.
vi.setConfig({ testTimeout: 60_000 });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * A gate that exits with the code it is told to.
 *
 * @param {number} number
 * @param {string} name
 * @param {number} code
 */
function gate(number, name, code) {
  return {
    number,
    name,
    command: process.execPath,
    args: ['-e', `process.exit(${String(code)})`],
  };
}

describe('runGateList', () => {
  // S-71 — cheapest first, and it stops at the first red.
  it('runs the gates in order and stops at the first failure', () => {
    /** @type {string[]} */
    const seen = [];

    const outcomes = runGateList(
      repoRoot,
      [gate(1, 'first', 0), gate(2, 'second', 1), gate(3, 'third', 0)],
      (outcome) => seen.push(`${outcome.gate.name}:${outcome.state}`),
    );

    expect(seen).toEqual(['first:passed', 'second:failed']);
    expect(outcomes).toHaveLength(2);
  });

  it('runs everything when nothing fails', () => {
    const outcomes = runGateList(repoRoot, [gate(1, 'a', 0), gate(2, 'b', 0)], () => {});

    expect(outcomes.map((outcome) => outcome.state)).toEqual(['passed', 'passed']);
  });

  it('keeps the code the gate exited with, not a flattened 1', () => {
    const [outcome] = runGateList(repoRoot, [gate(1, 'a', 3)], () => {});

    expect(outcome?.code).toBe(3);
  });

  it('reports a gate that does not apply as skipped, without running it', () => {
    const outcomes = runGateList(
      repoRoot,
      [gate(1, 'absent', 1), gate(2, 'present', 0)],
      () => {},
      (candidate) => candidate.name === 'absent',
    );

    expect(outcomes.map((outcome) => outcome.state)).toEqual(['skipped', 'passed']);
  });

  it('times each gate, so the expensive one is visible', () => {
    const [outcome] = runGateList(repoRoot, [gate(1, 'a', 0)], () => {});

    expect(outcome?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('reportVerdict', () => {
  const green = { headline: 'all green', detail: 'done' };

  it('answers 0 only when every gate passed', () => {
    const outcomes = runGateList(repoRoot, [gate(1, 'a', 0)], () => {});

    expect(reportVerdict(outcomes, green)).toBe(0);
  });

  // S-72 — a red gate means a non-zero exit, or the gate is decoration.
  it('answers non-zero when any gate failed', () => {
    const outcomes = runGateList(repoRoot, [gate(1, 'a', 0), gate(2, 'b', 1)], () => {});

    expect(reportVerdict(outcomes, green)).toBe(1);
  });

  it('a run that skipped everything is still a pass — there was nothing to fail', () => {
    const outcomes = runGateList(
      repoRoot,
      [gate(1, 'a', 1)],
      () => {},
      () => true,
    );

    expect(reportVerdict(outcomes, green)).toBe(0);
  });
});
