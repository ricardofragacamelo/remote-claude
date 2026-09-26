#!/usr/bin/env node
/**
 * The static security gate: gate 10 of the validation protocol.
 *
 * This backend runs arbitrary commands on the user's machine. Four checks, and none of them is
 * a formality:
 *
 * | check        | catches                                                          |
 * |--------------|------------------------------------------------------------------|
 * | secrets      | a credential that reached the history — it cannot be unpublished  |
 * | dependencies | a known vulnerability in something we did not write               |
 * | patterns     | path traversal, command injection, a JWT trusting its own `alg`   |
 * | product      | the Agent SDK holes that open **in silence**                      |
 *
 * The last one is ours alone: no generic scanner knows that `query()` without
 * `settingSources: ['project']` turns `canUseTool` off without saying so.
 *
 * Usage: `pnpm scan:security`
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { inspectAll } from './lib/agent-sdk-rules.mjs';
import { inspectAll as inspectVendorNames } from './lib/vendor-name-rules.mjs';
import { filesUnder } from './lib/files.mjs';
import { commandExists, runAttached } from './lib/exec.mjs';
import { repoRoot } from './lib/paths.mjs';
import { bold, dim, fail, hint, info, line, ok, title, warn } from './lib/ui.mjs';

/** Where the product rules look. Everything that could ever call the Agent SDK. */
const PRODUCT_SOURCES = [
  { dir: 'backend/src', extensions: ['.ts'] },
  { dir: 'packages', extensions: ['.ts'] },
];

/**
 * Where a supplier's name may not appear.
 *
 * All three ends, because the rule is about the product and not about one of its halves: a
 * provider named in the app is exactly as hard to change as one named in the backend.
 */
const VENDOR_SOURCES = [
  { dir: 'backend/src', extensions: ['.ts'] },
  { dir: 'web/src', extensions: ['.ts', '.tsx'] },
  { dir: 'mobile/lib', extensions: ['.dart'] },
];

/** Pinned so the check is the same one everywhere, today and in six months. */
const SEMGREP_IMAGE = 'semgrep/semgrep:1.86.0';

/** Rulesets the pattern scan runs. `p/secrets` overlaps gitleaks on purpose — belt and braces. */
const SEMGREP_RULES = ['p/typescript', 'p/nodejs', 'p/command-injection', 'p/jwt'];

/** @returns {number} */
function checkSecrets() {
  info('secrets — gitleaks over the whole repository');
  return runAttached('node', [path.join(repoRoot, 'scripts', 'secrets-scan.mjs')], {
    cwd: repoRoot,
  }).code;
}

/** @returns {number} */
function checkDependencies() {
  info('dependencies — pnpm audit, high and above');

  const result = runAttached('pnpm', ['audit', '--audit-level', 'high'], {
    cwd: repoRoot,
    timeoutMs: 300_000,
  });

  if (result.code === 0) {
    ok('no high or critical advisory');
    return 0;
  }

  fail('pnpm audit found an advisory', 'update the dependency; never ignore the advisory id');
  return result.code;
}

/**
 * The pattern scan, preferring the local binary and falling back to the pinned image.
 *
 * Docker is already a hard requirement of this project, so there is a fallback rather than a
 * skip: a check that skips itself when a tool is missing is a check that is never run.
 *
 * @returns {number}
 */
function checkPatterns() {
  info('patterns — semgrep');

  const ruleArgs = SEMGREP_RULES.flatMap((ruleset) => ['--config', ruleset]);

  if (commandExists('semgrep')) {
    return runAttached('semgrep', ['--error', '--quiet', ...ruleArgs, '.'], {
      cwd: repoRoot,
      timeoutMs: 900_000,
    }).code;
  }

  if (!commandExists('docker')) {
    fail('neither semgrep nor docker is available');
    hint('install semgrep (https://semgrep.dev), or start Docker');
    return 1;
  }

  info(`semgrep not on PATH — using ${SEMGREP_IMAGE}`);

  return runAttached(
    'docker',
    [
      'run',
      '--rm',
      '--volume',
      `${repoRoot}:/src`,
      '--workdir',
      '/src',
      SEMGREP_IMAGE,
      'semgrep',
      '--error',
      '--quiet',
      ...ruleArgs,
      '.',
    ],
    { cwd: repoRoot, timeoutMs: 900_000 },
  ).code;
}

/**
 * One source-level rule, over one set of folders.
 *
 * Both product rules do the same four things — read the files, inspect them, report every
 * finding, and say how many were looked at when there is none. The rule itself is the parameter;
 * writing the rest twice is how the two reports come to disagree about what a finding looks like.
 *
 * @param {object} rule
 * @param {string} rule.headline what is being checked, for the reader
 * @param {readonly { dir: string, extensions: readonly string[] }[]} rule.sources
 * @param {(files: readonly { file: string, source: string }[]) => import('./lib/source-rules.mjs').Finding[]} rule.inspect
 * @param {string} rule.clean what it means when nothing was found
 * @param {string} rule.where the pointer a reader follows after a finding
 * @returns {number}
 */
function runSourceRule(rule) {
  info(rule.headline);

  const files = rule.sources.flatMap((source) =>
    filesUnder(path.join(repoRoot, source.dir), source.extensions)
      .filter((file) => !file.endsWith('.d.ts') && !file.endsWith('.g.dart'))
      .map((file) => ({
        file: path.relative(repoRoot, file),
        source: fs.readFileSync(file, 'utf8'),
      })),
  );

  const findings = rule.inspect(files);

  for (const finding of findings) {
    fail(`${finding.file}:${String(finding.line)}`, `${finding.rule} — ${finding.detail}`);
  }

  if (findings.length > 0) {
    hint(rule.where);
    return 1;
  }

  ok(`${String(files.length)} file(s) inspected`, dim(rule.clean));
  return 0;
}

/**
 * The supplier names, across all three ends.
 *
 * `02 · S-26`. It is separate from the Agent SDK rules because it is a different kind of rule:
 * those are about a protection that silently switches off, this is about a name that quietly
 * spreads until changing provider stops being a change of configuration.
 *
 * @returns {number}
 */
function checkVendorNames() {
  return runSourceRule({
    headline: 'supplier names — the one thing configuration owns',
    sources: VENDOR_SOURCES,
    inspect: inspectVendorNames,
    clean: 'no supplier is named outside the configuration',
    where: 'the endpoint, the scope and the credential file are configuration — see .env.example',
  });
}

/** @returns {number} */
function checkProductRules() {
  return runSourceRule({
    headline: 'product rules — the Agent SDK holes that open in silence',
    sources: PRODUCT_SOURCES,
    inspect: inspectAll,
    clean: 'no Agent SDK rule is broken',
    where: 'docs/architecture/shared/00-decisions.md#adr-011',
  });
}

title('security — secrets, dependencies, patterns and the product rules');

/** @type {{ name: string, code: number }[]} */
const outcomes = [];

for (const [name, check] of /** @type {[string, () => number][]} */ ([
  ['secrets', checkSecrets],
  ['dependencies', checkDependencies],
  ['product rules', checkProductRules],
  ['supplier names', checkVendorNames],
  ['patterns', checkPatterns],
])) {
  line();
  outcomes.push({ name, code: check() });
}

const failed = outcomes.filter((outcome) => outcome.code !== 0);

line();

if (failed.length === 0) {
  ok(bold('every security check passed'));
  process.exit(0);
}

for (const outcome of failed) {
  fail(outcome.name, `exit ${String(outcome.code)}`);
}

warn('a finding here is not a formality: this backend executes commands on the user’s machine');
process.exit(1);
