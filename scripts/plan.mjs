#!/usr/bin/env node
/**
 * Scaffolds a plan in the normative format, and recalculates the counters of its `progress.md`.
 *
 * The format (docs/plans/README.md) has three fixed files, one file per phase and ID
 * conventions. Reproducing it by hand on every plan is repetition, and it is where the format
 * starts to drift. The counters have the same problem in reverse: kept by hand, they are wrong.
 *
 * It also keeps `docs/plans/progress.md` — the general progress, across plans — in sync: a plan
 * that only updates its own diary leaves the project-wide answer wrong. The counters cover the
 * open decisions too, because a decision nobody tracks is a decision taken by omission.
 * And the state column of the plan index, `docs/plans/README.md`, which nothing moved before: it
 * said "não iniciado" of plans long finished.
 *
 * `--at <nn>` creates the plan in the middle of the sequence: every plan from `<nn>` on moves up
 * by one — its directory and every explicit reference to it, across the repository — and the
 * lines the rewrite could not decide on are listed for a person to read (scripts/lib/plan-renumber.mjs).
 *
 * Usage:
 *   pnpm plan new <name> [--phases foundation,backend,web] [--at <nn>]
 *   pnpm plan progress [<plan>]      # every plan without one; also accepts --progress
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import {
  applyIndexStates,
  applyOverallProgress,
  applyPhaseStates,
  applyProgress,
  changedBeyondTheDate,
  overallProblems,
  planProgressProblems,
  summarizeOverall,
  summarizePlan,
} from './lib/plan-progress.mjs';
import { directoryMoves, shiftReferences, suspectLines } from './lib/plan-renumber.mjs';
import {
  buildPlanFiles,
  e2eLast,
  isValidSlug,
  withPlanIndexed,
  withPlanInOverallProgress,
} from './lib/plan-template.mjs';
import { dim, fail, hint, line, ok, title, warn } from './lib/ui.mjs';

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
 * The phases asked for with `--phases a,b,c` — just `foundation` when the flag is absent, and
 * none at all when it is given empty. Asked for or not, the plan ends with its E2E phase.
 *
 * @param {readonly string[]} args
 * @returns {string[]}
 */
function phasesOf(args) {
  const phasesFlag = args.indexOf('--phases');
  if (phasesFlag === -1) {
    return e2eLast(['foundation']);
  }
  const asked = (args[phasesFlag + 1] ?? '')
    .split(',')
    .map((phase) => phase.trim())
    .filter((phase) => phase !== '');
  return asked.length === 0 ? [] : e2eLast(asked);
}

/**
 * The two-digit number the next plan takes: one after the highest, `00` for the first.
 *
 * @returns {string}
 */
function nextPlanNumber() {
  return String((existingPlans().at(-1)?.number ?? -1) + 1).padStart(2, '0');
}

/** The files whose references a renumbering rewrites: text that people and agents read. */
const RENUMBERED_FILE = /\.(?:md|mjs|js|cjs|ts|tsx|dart|json|ya?ml|arb|sh|txt)$/u;

/** Text that is written by a tool, never by hand — the tool that wrote it rewrites it. */
const GENERATED_FILE = /(?:^|\/)pnpm-lock\.yaml$|\.g\.dart$|\.gen\.ts$/u;

/**
 * The renumbering's own source and tests: their plan numbers are examples of the forms it
 * rewrites, and rewriting them would change what the tests assert.
 */
const RENUMBERING_ITSELF = new Set([
  'scripts/lib/plan-renumber.mjs',
  'test/unit/scripts/plan-renumber.spec.mjs',
]);

/**
 * The number asked for with `--at <nn>`, `null` without the flag, or `NaN` when it is not two
 * digits.
 *
 * @param {readonly string[]} args
 * @returns {number | null}
 */
function insertionPointOf(args) {
  const atFlag = args.indexOf('--at');
  if (atFlag === -1) {
    return null;
  }
  const value = args[atFlag + 1] ?? '';
  return /^\d{2}$/u.test(value) ? Number(value) : Number.NaN;
}

/**
 * Every file of the working tree git would consider — tracked or new, never ignored.
 *
 * @returns {string[]} paths relative to the repository root
 */
function workingTreeFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => RENUMBERED_FILE.test(file) && !GENERATED_FILE.test(file))
    .filter((file) => !RENUMBERING_ITSELF.has(file))
    .filter((file) => fs.existsSync(path.join(repoRoot, file)));
}

/**
 * Moves every plan from `from` on up by one: the references first, while every path still
 * resolves, then the directories, highest first.
 *
 * @param {number} from
 * @returns {void}
 */
function makeRoomAt(from) {
  const moves = directoryMoves(existingPlans(), from);
  const shift = { from, slugs: moves.map((move) => move.from.slice(3)) };

  /** @type {string[]} */
  const suspects = [];
  let rewritten = 0;

  for (const file of workingTreeFiles()) {
    const absolute = path.join(repoRoot, file);
    const before = fs.readFileSync(absolute, 'utf8');
    const after = shiftReferences(before, shift);

    for (const suspect of suspectLines(before, after, shift)) {
      suspects.push(`${file}:${String(suspect.line)}  ${suspect.text}`);
    }
    if (after !== before) {
      fs.writeFileSync(absolute, after);
      rewritten += 1;
    }
  }

  for (const move of moves) {
    fs.renameSync(path.join(plansDir, move.from), path.join(plansDir, move.to));
    ok(`${move.from} → ${move.to}`);
  }
  ok(`${String(rewritten)} files`, 'references rewritten');

  if (suspects.length > 0) {
    line();
    warn(`${String(suspects.length)} lines to read — a bare number, or the story of a renumbering`);
    for (const suspect of suspects) {
      line(dim(`  ${suspect}`));
    }
    line();
  }
}

/**
 * The plan `new` was asked for, or `null` after saying why the arguments do not describe one.
 *
 * @param {readonly string[]} args
 * @returns {{ number: string, slug: string, phases: string[] } | null}
 */
function requestedPlan(args) {
  const slug = args[0];
  const phases = phasesOf(args);

  if (slug === undefined || !isValidSlug(slug)) {
    fail('a plan name in kebab-case is required', 'e.g. pnpm plan new claude-integration');
    return null;
  }

  const invalidPhase = phases.find((phase) => !isValidSlug(phase));
  if (phases.length === 0 || invalidPhase !== undefined) {
    fail(`phase names must be kebab-case: ${invalidPhase ?? '(none given)'}`);
    hint('pnpm plan new <name> --phases foundation,backend,web');
    return null;
  }

  const lastNumber = nextPlanNumber();
  const insertionPoint = insertionPointOf(args);

  if (insertionPoint !== null && !(insertionPoint <= Number(lastNumber))) {
    fail(
      `--at takes a two-digit plan number up to ${lastNumber}`,
      'e.g. pnpm plan new mobile --at 10',
    );
    return null;
  }

  if (existingPlans().some((plan) => plan.name.slice(3) === slug)) {
    fail(`a plan named ${slug} already exists`);
    return null;
  }

  const number = insertionPoint === null ? lastNumber : String(insertionPoint).padStart(2, '0');
  return { number, slug, phases };
}

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function createPlan(args) {
  const spec = requestedPlan(args);

  if (spec === null) {
    return 1;
  }

  if (spec.number !== nextPlanNumber()) {
    makeRoomAt(Number(spec.number));
  }

  const planDir = path.join(plansDir, `${spec.number}-${spec.slug}`);
  const indexPath = path.join(plansDir, 'README.md');
  const indexed = withPlanIndexed(fs.readFileSync(indexPath, 'utf8'), spec);

  fs.mkdirSync(planDir, { recursive: true });
  for (const file of buildPlanFiles(spec)) {
    fs.writeFileSync(path.join(planDir, file.name), file.content);
    ok(path.relative(repoRoot, path.join(planDir, file.name)));
  }

  fs.writeFileSync(indexPath, indexed);
  ok(path.relative(repoRoot, indexPath), 'plan added to the index');

  const overallPath = path.join(plansDir, 'progress.md');
  fs.writeFileSync(
    overallPath,
    withPlanInOverallProgress(fs.readFileSync(overallPath, 'utf8'), spec),
  );
  ok(path.relative(repoRoot, overallPath), 'plan added to the general progress');

  line();
  line(dim('next: fill in the scenario matrix — a plan without one is not a plan'));
  return 0;
}

/**
 * @param {string} wanted plan directory name, or just its number
 * @returns {string | null} absolute path
 */
function resolvePlanDir(wanted) {
  const match = existingPlans().find(
    (plan) =>
      plan.name === wanted || plan.name.startsWith(`${wanted}-`) || `${plan.number}` === wanted,
  );

  return match === undefined ? null : path.join(plansDir, match.name);
}

/**
 * Rewrites a progress document, refusing to half-update it.
 *
 * Both recalculations do the same three things — read, transform, write — and the transform is
 * the only difference. It throws when the document lost an anchor, and that message is the
 * whole point: a counter that silently fails to update is worse than no counter.
 *
 * @param {string} file absolute path
 * @param {(content: string) => string} rewrite
 * @returns {boolean} whether it was written
 */
function rewriteProgress(file, rewrite) {
  const before = fs.readFileSync(file, 'utf8');
  let updated;

  try {
    updated = rewrite(before);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return false;
  }

  // Only what moved is written: the date of a document whose counters did not change stays.
  if (changedBeyondTheDate(before, updated)) {
    fs.writeFileSync(file, updated);
  }
  return true;
}

/** @returns {string} today, as `YYYY-MM-DD` */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The content of a plan file, or an empty string when it does not exist yet.
 *
 * @param {string} planDir
 * @param {string} name
 * @returns {string}
 */
function planFile(planDir, name) {
  const file = path.join(planDir, name);

  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

/**
 * The phase files of a plan, in no particular order — `summarizePlan` sorts them.
 *
 * @param {string} planDir
 * @returns {Array<{ index: number, file: string, content: string }>}
 */
function phaseFilesOf(planDir) {
  return fs
    .readdirSync(planDir)
    .map((name) => ({ name, match: PHASE_FILE.exec(name) }))
    .filter((entry) => entry.match !== null)
    .map((entry) => ({
      index: Number(entry.match?.[1] ?? 0),
      file: entry.name,
      content: fs.readFileSync(path.join(planDir, entry.name), 'utf8'),
    }));
}

/**
 * Recalculates `docs/plans/progress.md` from **every** plan on disk.
 *
 * Runs after any per-plan recalculation: the general progress is derived from the same markers,
 * so it can never be stale unless someone edits it by hand — which is what it exists to stop.
 *
 * @returns {number} exit code
 */
function recalculateOverall() {
  const overallPath = path.join(plansDir, 'progress.md');

  if (!fs.existsSync(overallPath)) {
    fail('docs/plans/progress.md is missing', 'the general progress is part of the format');
    return 1;
  }

  /** @type {Array<{ dir: string, summary: ReturnType<typeof summarizePlan> }>} */
  const entries = [];
  /** @type {string[]} */
  const problems = [];

  for (const plan of existingPlans()) {
    const planDir = path.join(plansDir, plan.name);
    const phaseFiles = phaseFilesOf(planDir);

    if (phaseFiles.length === 0 || !fs.existsSync(path.join(planDir, 'scenarios.md'))) {
      fail(`${plan.name} is not in the normative format`, 'expected F0-<name>.md and scenarios.md');
      return 1;
    }

    const summary = summarizePlan(
      phaseFiles,
      planFile(planDir, 'scenarios.md'),
      planFile(planDir, 'decisions.md'),
    );
    entries.push({ dir: plan.name, summary });

    // The plan's own index of phases says what its tasks say, and its diary does not contradict it.
    if (
      !rewriteProgress(path.join(planDir, 'README.md'), (content) =>
        applyPhaseStates(content, summary, plan.name),
      )
    ) {
      return 1;
    }
    problems.push(
      ...planProgressProblems(planFile(planDir, 'progress.md'), summary).map(
        (problem) => `${plan.name}/progress.md: ${problem}`,
      ),
    );
  }

  const overall = summarizeOverall(entries);
  const written = rewriteProgress(overallPath, (content) =>
    applyOverallProgress(content, overall, { date: today() }),
  );

  if (!written) {
    return 1;
  }

  ok(
    path.relative(repoRoot, overallPath),
    `${overall.taskDone}/${overall.taskTotal} tasks · ${overall.scenarioDone}/${overall.scenarioTotal} scenarios`,
  );

  const indexPath = path.join(plansDir, 'README.md');
  if (!rewriteProgress(indexPath, (content) => applyIndexStates(content, overall))) {
    return 1;
  }

  ok(path.relative(repoRoot, indexPath), 'the state of each plan in the index');

  problems.push(
    ...overallProblems(fs.readFileSync(overallPath, 'utf8'), overall).map(
      (problem) => `docs/plans/progress.md: ${problem}`,
    ),
  );

  // The counters are written either way; what is written by hand and contradicts them is the
  // author's to fix — and the command fails until it is, so the gap cannot pass unnoticed.
  for (const problem of problems) {
    fail(problem);
  }
  if (problems.length > 0) {
    hint('write it in the plan, then run pnpm plan progress again');
    return 1;
  }

  ok('the hand-written parts', 'agree with the counters');
  return 0;
}

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function recalculateProgress(args) {
  const wanted = args.find((arg) => !arg.startsWith('--'));

  return wanted === undefined ? recalculateEveryPlan() : recalculatePlan(wanted);
}

/**
 * Every plan, one after the other. Without a plan, every plan: recalculating only the last one left
 * the diaries of the others behind, while the general progress — derived from all of them — moved on.
 *
 * @returns {number}
 */
function recalculateEveryPlan() {
  for (const plan of existingPlans()) {
    title(plan.name);
    const code = recalculatePlan(plan.name);
    if (code !== 0) {
      return code;
    }
  }
  return 0;
}

/**
 * @param {string} wanted the plan's directory, or its number
 * @returns {number}
 */
function recalculatePlan(wanted) {
  const planDir = resolvePlanDir(wanted);

  if (planDir === null) {
    fail('no plan found', 'pass the plan directory, e.g. pnpm plan progress 00-bootstrap');
    return 1;
  }

  const progressPath = path.join(planDir, 'progress.md');
  const scenariosPath = path.join(planDir, 'scenarios.md');
  const decisionsPath = path.join(planDir, 'decisions.md');

  for (const required of [progressPath, scenariosPath, decisionsPath]) {
    if (!fs.existsSync(required)) {
      fail(`${path.relative(repoRoot, required)} is missing`, 'the plan format requires it');
      return 1;
    }
  }

  const phaseFiles = phaseFilesOf(planDir);

  if (phaseFiles.length === 0) {
    fail(`${path.relative(repoRoot, planDir)} has no phase file`, 'expected F0-<name>.md');
    return 1;
  }

  const summary = summarizePlan(
    phaseFiles,
    fs.readFileSync(scenariosPath, 'utf8'),
    fs.readFileSync(decisionsPath, 'utf8'),
  );

  const written = rewriteProgress(progressPath, (content) =>
    applyProgress(content, summary, { date: today() }),
  );

  if (!written) {
    return 1;
  }

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
    return createPlan(rest) || recalculateOverall();
  }

  if (command === 'progress' || command === '--progress') {
    title('plan progress');
    return recalculateProgress(rest) || recalculateOverall();
  }

  fail(`unknown command: ${command ?? '(none)'}`);
  hint('pnpm plan new <name> [--phases a,b,c] [--at <nn>]');
  hint('pnpm plan progress [<plan>]');
  return 1;
}

process.exitCode = main();
