#!/usr/bin/env node
/**
 * The neutrality gate (plan 28, B-04 and B-05): nothing in the core of the three ends names a coding
 * agent.
 *
 *   node scripts/engine-neutrality.mjs   # pnpm neutral:check
 *
 * Reads the code of the core (`backend/src`, `web/src`, `mobile/lib`, out of `engines/`), the strings
 * of i18n and every schema of the contract against `scripts/engine-vocabulary.json`, and fails on any
 * violation the baseline does not hold, and on an entry that no longer occurs as written. The baseline
 * is empty since the window of the previous protocol closed (plan 28, F7, B-47), and there is no
 * `--write-baseline` to regenerate it anymore — the gate rejects every violation now, with no
 * exception beyond the product's own names in `engine-vocabulary.json`'s `exceptions`. An entry here
 * is a decision a person writes by hand, never a script's. Part of gate 11.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { checkBaseline, remainingByPhase, scanFile, scopeOf } from './lib/engine-neutrality.mjs';
import { filesUnder } from './lib/files.mjs';
import { repoRoot } from './lib/paths.mjs';
import { phaseStates } from './lib/render-parity.mjs';
import { dim, fail, hint, line, ok, title } from './lib/ui.mjs';

const VOCABULARY = path.join(repoRoot, 'scripts', 'engine-vocabulary.json');
const BASELINE = path.join(repoRoot, 'scripts', 'engine-neutrality-baseline.json');
const PROGRESS = path.join(repoRoot, 'docs', 'plans', '28-agent-neutral-core', 'progress.md');
const ROOTS = ['backend/src', 'web/src', 'mobile/lib', 'packages/contracts/schema'];
const EXTENSIONS = ['.ts', '.tsx', '.dart', '.json', '.arb'];

/** @param {string} file */
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Every file the gate reads, relative to the repository. */
function filesInScope() {
  return ROOTS.flatMap((root) => filesUnder(path.join(repoRoot, root), EXTENSIONS))
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
    .filter((file) => scopeOf(file) !== null)
    .sort();
}

function main() {
  title('neutral-check — the core names no coding agent');

  /** @type {import('./lib/engine-neutrality.mjs').Vocabulary} */
  const vocabulary = readJson(VOCABULARY);
  /** @type {{ $comment?: string, entries: import('./lib/engine-neutrality.mjs').BaselineEntry[] }} */
  const baseline = readJson(BASELINE);
  const files = filesInScope();
  const violations = files.flatMap((file) =>
    scanFile(file, fs.readFileSync(path.join(repoRoot, file), 'utf8'), vocabulary),
  );

  const problems = checkBaseline(
    violations,
    baseline.entries,
    phaseStates(fs.readFileSync(PROGRESS, 'utf8')),
  );
  for (const [phase, left] of remainingByPhase(baseline.entries)) {
    line(
      dim(`${phase} still removes ${String(left.occurrences)} in ${String(left.entries)} entries`),
    );
  }

  if (problems.length > 0) {
    const reasons = new Map(vocabulary.terms.map((term) => [term.term, term]));
    for (const each of problems) {
      const term = reasons.get(each.term);
      fail(`${each.kind} · ${each.file} · ${each.term}`, each.detail);
      if (each.kind === 'new' && term !== undefined) {
        hint(`${term.reason}; it lives in ${term.home}`);
      }
    }
    return 1;
  }

  ok('the core names no coding agent', `${String(files.length)} files read`);
  return 0;
}

process.exitCode = main();
