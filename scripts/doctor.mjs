#!/usr/bin/env node
/**
 * Checks the prerequisites of the environment before anything else runs: node, pnpm, docker,
 * flutter, the fixed ports of the development stack, and which workspace allowlist `pnpm dev` runs
 * with.
 *
 * This is the first command after cloning the repository, and what keeps an environment error
 * from being debugged as if it were a code error.
 *
 * Usage: `pnpm doctor` · `pnpm doctor --strict` (a warning also fails)
 */

import fs from 'node:fs';
import process from 'node:process';

import { LOCAL_ALLOWLIST_FILE, allowlistCheck } from './lib/allowlist.mjs';
import { run } from './lib/exec.mjs';
import { repoRoot } from './lib/paths.mjs';
import { isPortFree } from './lib/ports.mjs';
import { exitCodeFor, inspectEnvironment } from './lib/prerequisites.mjs';
import { loadDotEnv } from './lib/stack.mjs';
import { dim, fail, hint, line, ok, title, warn } from './lib/ui.mjs';

const strict = process.argv.includes('--strict');

// `.env` says which allowlist the stack runs with, as it does for `pnpm dev`.
loadDotEnv(repoRoot);

/** @typedef {import('./lib/prerequisites.mjs').CheckResult} CheckResult */

/**
 * Prints one prerequisite: a line for what passed, a warning or a failure — and its fix — for
 * what did not.
 *
 * @param {CheckResult} result
 */
function report(result) {
  if (result.status === 'ok') {
    ok(result.name, result.detail);
    return;
  }

  if (result.status === 'warn') {
    warn(`${result.name} — ${result.detail}`);
  } else {
    fail(`${result.name} — ${result.detail}`);
  }

  if (result.fix !== undefined) {
    hint(result.fix);
  }
}

/**
 * Prints the verdict over every prerequisite.
 *
 * @param {number} failures
 * @param {number} warnings
 */
function summarize(failures, warnings) {
  line();
  if (failures > 0) {
    fail(`${failures} prerequisite(s) missing`, 'solve them before running anything else');
  } else if (warnings > 0 && strict) {
    fail(`${warnings} warning(s), and --strict was asked for`);
  } else if (warnings > 0) {
    warn(`${warnings} warning(s)`, 'nothing blocking — each one says what it affects');
  } else {
    ok('environment is ready');
  }

  if (!strict && warnings > 0) {
    line(dim('run with --strict to have warnings fail the command (CI uses it)'));
  }
}

async function main() {
  title('doctor — environment prerequisites');

  const results = await inspectEnvironment({
    nodeVersion: process.version,
    run: (command, args) => run(command, args, { timeoutMs: 20_000 }),
    isPortFree: (port) => isPortFree(port),
  });

  // Plan 06, S-61: with a local copy beside the default, "which allowlist?" is a real question.
  results.push(
    allowlistCheck(
      process.env,
      { root: repoRoot, localExists: fs.existsSync(LOCAL_ALLOWLIST_FILE) },
      (file) => fs.readFileSync(file, 'utf8'),
    ),
  );

  for (const result of results) {
    report(result);
  }

  summarize(
    results.filter((result) => result.status === 'fail').length,
    results.filter((result) => result.status === 'warn').length,
  );

  return exitCodeFor(results, { strict });
}

process.exitCode = await main();
