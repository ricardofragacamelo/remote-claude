#!/usr/bin/env node
/**
 * Checks the prerequisites of the environment before anything else runs: node, pnpm, docker,
 * flutter, and the fixed ports of the development stack.
 *
 * This is the first command after cloning the repository, and what keeps an environment error
 * from being debugged as if it were a code error.
 *
 * Usage: `pnpm doctor` · `pnpm doctor --strict` (a warning also fails)
 */

import process from 'node:process';

import { run } from './lib/exec.mjs';
import { isPortFree } from './lib/ports.mjs';
import { exitCodeFor, inspectEnvironment } from './lib/prerequisites.mjs';
import { dim, fail, hint, line, ok, title, warn } from './lib/ui.mjs';

const strict = process.argv.includes('--strict');

async function main() {
  title('doctor — environment prerequisites');

  const results = await inspectEnvironment({
    nodeVersion: process.version,
    run: (command, args) => run(command, args, { timeoutMs: 20_000 }),
    isPortFree: (port) => isPortFree(port),
  });

  for (const result of results) {
    if (result.status === 'ok') {
      ok(result.name, result.detail);
      continue;
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

  const failures = results.filter((result) => result.status === 'fail').length;
  const warnings = results.filter((result) => result.status === 'warn').length;

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

  return exitCodeFor(results, { strict });
}

process.exitCode = await main();
