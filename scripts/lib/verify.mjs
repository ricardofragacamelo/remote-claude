/**
 * Running the repository's gates and reporting them.
 *
 * `verify` and `verify:full` are the same walk over two lengths of the same list, so they share
 * this. Two copies of it would be two places to forget the rule the whole protocol is named
 * after: a red gate means fix it and **start again from gate one**.
 */

import { repositoryGates, runGateList } from './gates.mjs';
import { repoRoot } from './paths.mjs';
import { bold, dim, fail, hint, line, ok, title, warn } from './ui.mjs';

/**
 * Prints one gate as it settles.
 *
 * @param {import('./gates.mjs').GateOutcome} outcome
 */
export function reportOutcome(outcome) {
  const label = `${String(outcome.gate.number)}. ${outcome.gate.name}`;
  const took = dim(`${String(Math.round(outcome.durationMs / 100) / 10)}s`);

  if (outcome.state === 'skipped') {
    warn(label, 'not declared here');
    return;
  }

  if (outcome.state === 'passed') {
    ok(label, took);
    return;
  }

  fail(label, `exit ${String(outcome.code)}`);
}

/**
 * Prints the verdict and answers the exit code.
 *
 * The hints on a red gate are the protocol itself: fix the cause, start again from gate one, and
 * stop after three cycles without progress instead of working around it.
 *
 * @param {readonly import('./gates.mjs').GateOutcome[]} outcomes
 * @param {{ headline: string, detail: string }} green what to say when nothing failed
 * @returns {number} 0 only when every gate passed
 */
export function reportVerdict(outcomes, green) {
  const failed = outcomes.find((outcome) => outcome.state === 'failed');

  line();

  if (failed === undefined) {
    ok(bold(green.headline), green.detail);
    return 0;
  }

  fail(bold(`gate ${String(failed.gate.number)} — ${failed.gate.name}`), 'stopped here');
  hint('fix the cause, then run this again from gate 1 — a fix for one gate breaks another');
  hint('three cycles with no progress on the same gate: stop and escalate, never work around it');
  hint('docs/architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção');
  return 1;
}

/**
 * Runs the repository's gates and reports them.
 *
 * @param {boolean} full gates 1-11 rather than 1-7
 * @param {readonly import('./gates.mjs').Gate[]} [gates] the list to run; the repository's own
 *   by default, injected by a test that would otherwise have to spend eleven minutes to see
 *   what this function does with the answers
 * @returns {number} exit code: 0 only when every gate passed
 */
export function verify(full, gates = repositoryGates(full)) {
  title(`${full ? 'verify:full' : 'verify'} — gates 1-${String(gates.length)}`);
  line(dim('cheapest first, stopping at the first red'));

  return reportVerdict(runGateList(repoRoot, gates, reportOutcome), {
    headline: full ? 'all eleven gates green' : 'gates 1-7 green',
    detail: full ? 'this is what "done" means' : 'now run pnpm verify:full',
  });
}
