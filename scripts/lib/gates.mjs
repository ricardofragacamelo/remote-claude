/**
 * The quality gates, in the order the validation protocol fixes: cheapest first, stopping at the
 * first red.
 *
 * Two lists live here, and they are the same seven ideas seen from two distances: the gates of a
 * single workspace (`pnpm --filter web verify`) and the gates of the repository
 * (`pnpm verify`). Describing them once is what keeps the two from drifting into "the web does
 * not run duplication" — and the duplication gate itself would catch a second copy of this file,
 * which is the point.
 *
 * See docs/architecture/shared/11-validation-protocol.md#estágio-2--os-portões.
 */

import fs from 'node:fs';
import path from 'node:path';

import { runAttached } from './exec.mjs';

/**
 * @typedef {object} Gate
 * @property {number} number position in the protocol's numbering
 * @property {string} name what it checks
 * @property {string} command executable
 * @property {readonly string[]} args
 * @property {string} [dir] directory to run in, relative to the repository root; the root itself
 *   when absent
 * @property {string} [needsScript] skip unless the workspace declares this npm script
 */

/**
 * The gates for a workspace, as commands.
 *
 * Formatting, lint and duplication are repository-wide tools scoped to the workspace directory;
 * typing, architecture and the tests belong to the workspace and run inside it.
 *
 * @param {string} workspace directory name, relative to the repository root
 * @returns {Gate[]}
 */
export function gatesFor(workspace) {
  return [
    {
      number: 1,
      name: 'formatting',
      command: 'pnpm',
      args: ['exec', 'prettier', '--check', workspace],
    },
    {
      number: 2,
      name: 'lint',
      command: 'pnpm',
      args: ['exec', 'eslint', workspace, '--max-warnings=0'],
    },
    { number: 3, name: 'types', command: 'pnpm', args: ['run', 'typecheck'], dir: workspace },
    {
      number: 4,
      name: 'architecture',
      command: 'pnpm',
      args: ['run', 'lint:arch'],
      dir: workspace,
      needsScript: 'lint:arch',
    },
    {
      number: 5,
      name: 'duplication',
      command: 'pnpm',
      args: ['exec', 'jscpd', workspace],
    },
    { number: 6, name: 'unit', command: 'pnpm', args: ['run', 'test:unit'], dir: workspace },
    {
      number: 7,
      name: 'coverage (unit + integration)',
      command: 'pnpm',
      args: ['run', 'test:coverage'],
      dir: workspace,
      needsScript: 'test:coverage',
    },
  ];
}

/**
 * The npm scripts a workspace declares.
 *
 * @param {string} rootDir
 * @param {string} workspace
 * @returns {Set<string>}
 */
export function declaredScripts(rootDir, workspace) {
  const manifest = path.join(rootDir, workspace, 'package.json');

  if (!fs.existsSync(manifest)) {
    return new Set();
  }

  const parsed = /** @type {{ scripts?: Record<string, string> }} */ (
    JSON.parse(fs.readFileSync(manifest, 'utf8'))
  );

  return new Set(Object.keys(parsed.scripts ?? {}));
}

/**
 * @typedef {object} GateOutcome
 * @property {Gate} gate
 * @property {'passed' | 'failed' | 'skipped'} state
 * @property {number} code
 * @property {number} durationMs
 */

/**
 * Runs the gates until one fails.
 *
 * It stops at the first red on purpose: the protocol wants the fix and then a **restart from gate
 * one**, because a fix for lint changes duplication and a fix for a test changes architecture.
 * Carrying on past a failure would report a list of problems that no longer describes the code.
 *
 * @param {string} rootDir
 * @param {string} workspace
 * @param {(outcome: GateOutcome) => void} report called as each gate settles
 * @returns {GateOutcome[]}
 */
export function runGates(rootDir, workspace, report) {
  const scripts = declaredScripts(rootDir, workspace);

  return runGateList(rootDir, gatesFor(workspace), report, (gate) => {
    const needed = gate.needsScript;
    return needed !== undefined && !scripts.has(needed);
  });
}

/**
 * Runs a list of gates until one fails.
 *
 * @param {string} rootDir
 * @param {readonly Gate[]} gates
 * @param {(outcome: GateOutcome) => void} report called as each gate settles
 * @param {(gate: Gate) => boolean} [isSkipped] when a gate does not apply here
 * @returns {GateOutcome[]}
 */
export function runGateList(rootDir, gates, report, isSkipped = () => false) {
  /** @type {GateOutcome[]} */
  const outcomes = [];

  for (const gate of gates) {
    if (isSkipped(gate)) {
      const skipped = /** @type {GateOutcome} */ ({
        gate,
        state: 'skipped',
        code: 0,
        durationMs: 0,
      });
      outcomes.push(skipped);
      report(skipped);
      continue;
    }

    const startedAt = Date.now();
    const result = runAttached(gate.command, gate.args, {
      cwd: gate.dir === undefined ? rootDir : path.join(rootDir, gate.dir),
      timeoutMs: 900_000,
    });

    const outcome = /** @type {GateOutcome} */ ({
      gate,
      state: result.code === 0 ? 'passed' : 'failed',
      code: result.code,
      durationMs: Date.now() - startedAt,
    });

    outcomes.push(outcome);
    report(outcome);

    if (outcome.state === 'failed') {
      break;
    }
  }

  return outcomes;
}

/**
 * The gates of the whole repository, numbered as the protocol numbers them.
 *
 * Every step is an npm script or a `scripts/` entry, so the same gate a person runs by hand is
 * the one CI runs. The Flutter module is inside each gate rather than beside them: static
 * analysis is mandatory in **all three** modules, and a separate list is how one of them ends up
 * quietly exempt.
 *
 * @param {boolean} full whether to include gates 8-11, the expensive half
 * @returns {Gate[]}
 */
export function repositoryGates(full) {
  /** @type {Gate[]} */
  const fast = [
    { number: 1, name: 'formatting', command: 'pnpm', args: ['run', 'format:check'] },
    { number: 2, name: 'lint', command: 'pnpm', args: ['run', 'lint'] },
    { number: 3, name: 'types', command: 'pnpm', args: ['run', 'typecheck'] },
    { number: 4, name: 'architecture', command: 'pnpm', args: ['run', 'lint:arch'] },
    { number: 5, name: 'duplication', command: 'pnpm', args: ['run', 'lint:dup'] },
    { number: 6, name: 'unit', command: 'pnpm', args: ['run', 'test:unit'] },
    { number: 7, name: 'coverage', command: 'pnpm', args: ['run', 'test:coverage'] },
  ];

  if (!full) {
    return fast;
  }

  return [
    ...fast,
    { number: 8, name: 'integration', command: 'pnpm', args: ['run', 'test:integration'] },
    { number: 9, name: 'e2e', command: 'pnpm', args: ['run', 'test:e2e'] },
    { number: 10, name: 'security', command: 'pnpm', args: ['run', 'scan:security'] },
    {
      number: 11,
      name: 'contracts and i18n',
      command: 'pnpm',
      args: ['run', 'check:contracts-i18n'],
    },
  ];
}
