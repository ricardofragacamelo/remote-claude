#!/usr/bin/env node
/**
 * Scaffolds a plan in the normative format, and recalculates the counters of its `progress.md`.
 *
 * The format (docs/plans/README.md) has three fixed files, one file per phase and ID
 * conventions. Reproducing it by hand on every plan is repetition, and it is where the format
 * starts to drift. The counters have the same problem in reverse: kept by hand, they are wrong.
 *
 * Usage:
 *   pnpm plan new <name> [--phases foundation,backend,web]
 *   pnpm plan progress [<plan>]      # also accepts --progress
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { applyProgress, summarizePlan } from './lib/plan-progress.mjs';
import { buildPlanFiles, isValidSlug, withPlanIndexed } from './lib/plan-template.mjs';
import { dim, fail, hint, line, ok, title } from './lib/ui.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plansDir = path.join(repoRoot, 'docs', 'plans');
const PLAN_DIR = /^(\d{2})-([a-z0-9-]+)$/;
const PHASE_FILE = /^F(\d+)-[a-z0-9-]+\.md$/;

/**
 * @returns {Array<{ name: string, number: number }>}
 */
function existingPlans() {
  if (!fs.existsSync(plansDir)) {
    return [];
  }

  return fs
    .readdirSync(plansDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && PLAN_DIR.test(entry.name))
    .map((entry) => ({ name: entry.name, number: Number(entry.name.slice(0, 2)) }))
    .sort((left, right) => left.number - right.number);
}

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function createPlan(args) {
  const slug = args[0];
  const phasesFlag = args.indexOf('--phases');
  const phases =
    phasesFlag === -1
      ? ['foundation']
      : (args[phasesFlag + 1] ?? '')
          .split(',')
          .map((phase) => phase.trim())
          .filter((phase) => phase !== '');

  if (slug === undefined || !isValidSlug(slug)) {
    fail('a plan name in kebab-case is required', 'e.g. pnpm plan new claude-integration');
    return 1;
  }

  const invalidPhase = phases.find((phase) => !isValidSlug(phase));
  if (phases.length === 0 || invalidPhase !== undefined) {
    fail(`phase names must be kebab-case: ${invalidPhase ?? '(none given)'}`);
    hint('pnpm plan new <name> --phases foundation,backend,web');
    return 1;
  }

  const plans = existingPlans();
  const nextNumber = String((plans.at(-1)?.number ?? -1) + 1).padStart(2, '0');
  const planDir = path.join(plansDir, `${nextNumber}-${slug}`);

  if (fs.existsSync(planDir)) {
    fail(`${path.relative(repoRoot, planDir)} already exists`);
    return 1;
  }

  const spec = { number: nextNumber, slug, phases };
  const indexPath = path.join(plansDir, 'README.md');
  const indexed = withPlanIndexed(fs.readFileSync(indexPath, 'utf8'), spec);

  fs.mkdirSync(planDir, { recursive: true });
  for (const file of buildPlanFiles(spec)) {
    fs.writeFileSync(path.join(planDir, file.name), file.content);
    ok(path.relative(repoRoot, path.join(planDir, file.name)));
  }

  fs.writeFileSync(indexPath, indexed);
  ok(path.relative(repoRoot, indexPath), 'plan added to the index');

  line();
  line(dim('next: fill in the scenario matrix — a plan without one is not a plan'));
  return 0;
}

/**
 * @param {string | undefined} wanted plan directory name, or just its number
 * @returns {string | null} absolute path
 */
function resolvePlanDir(wanted) {
  const plans = existingPlans();

  if (wanted === undefined) {
    const latest = plans.at(-1);
    return latest === undefined ? null : path.join(plansDir, latest.name);
  }

  const match = plans.find(
    (plan) =>
      plan.name === wanted || plan.name.startsWith(`${wanted}-`) || `${plan.number}` === wanted,
  );

  return match === undefined ? null : path.join(plansDir, match.name);
}

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function recalculateProgress(args) {
  const planDir = resolvePlanDir(args.find((arg) => !arg.startsWith('--')));

  if (planDir === null) {
    fail('no plan found', 'pass the plan directory, e.g. pnpm plan progress 00-bootstrap');
    return 1;
  }

  const progressPath = path.join(planDir, 'progress.md');
  const scenariosPath = path.join(planDir, 'scenarios.md');

  for (const required of [progressPath, scenariosPath]) {
    if (!fs.existsSync(required)) {
      fail(`${path.relative(repoRoot, required)} is missing`, 'the plan format requires it');
      return 1;
    }
  }

  const phaseFiles = fs
    .readdirSync(planDir)
    .map((name) => ({ name, match: PHASE_FILE.exec(name) }))
    .filter((entry) => entry.match !== null)
    .map((entry) => ({
      index: Number(entry.match?.[1] ?? 0),
      file: entry.name,
      content: fs.readFileSync(path.join(planDir, entry.name), 'utf8'),
    }));

  if (phaseFiles.length === 0) {
    fail(`${path.relative(repoRoot, planDir)} has no phase file`, 'expected F0-<name>.md');
    return 1;
  }

  const summary = summarizePlan(phaseFiles, fs.readFileSync(scenariosPath, 'utf8'));

  let updated;
  try {
    updated = applyProgress(fs.readFileSync(progressPath, 'utf8'), summary, {
      date: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return 1;
  }

  fs.writeFileSync(progressPath, updated);

  for (const phase of summary.phases) {
    ok(`F${phase.index}`, `${phase.done}/${phase.tasks.length} ${phase.state} · ${phase.range}`);
  }
  const { counts, total } = summary.scenarios;
  line();
  ok(
    `${summary.taskDone}/${summary.taskTotal} tasks`,
    `scenarios: ${total} total · ${counts['✅'] ?? 0} passing · ${counts['🟡'] ?? 0} failing · ${counts['⬜'] ?? 0} not written`,
  );
  ok(path.relative(repoRoot, progressPath), 'counters recalculated');
  return 0;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'new') {
    title('plan new');
    return createPlan(rest);
  }

  if (command === 'progress' || command === '--progress') {
    title('plan progress');
    return recalculateProgress(rest);
  }

  fail(`unknown command: ${command ?? '(none)'}`);
  hint('pnpm plan new <name> [--phases a,b,c]');
  hint('pnpm plan progress [<plan>]');
  return 1;
}

process.exitCode = main();
