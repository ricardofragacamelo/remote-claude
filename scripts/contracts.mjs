#!/usr/bin/env node
/**
 * Generates the WebSocket protocol into TypeScript and Dart from the JSON Schema in
 * `packages/contracts/schema/`, and — with `--check` — fails when either is out of sync.
 *
 * `--check` covers **both** targets. Nothing written in TypeScript imports the Dart, so a schema
 * changed without regenerating it would go unnoticed until an app already on a store broke at
 * runtime. This is the only thing that catches it (risk R-04 of the bootstrap plan).
 *
 * Usage: `pnpm contracts:generate` · `pnpm contracts:check`
 */

import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import { ContractError } from './lib/contracts-model.mjs';
import { drift, targets, write } from './lib/contracts-io.mjs';
import { dim, fail, hint, line, ok, title } from './lib/ui.mjs';

const check = process.argv.includes('--check');

function main() {
  title(`contracts — ${check ? 'check' : 'generate'}`);

  /** @type {import('./lib/contracts-io.mjs').Target[]} */
  let planned;
  try {
    planned = targets(repoRoot);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    if (error instanceof ContractError) {
      hint('the generator accepts object, string, integer, boolean, array, enum and const');
    }
    return 1;
  }

  /** @type {string[]} */
  const stale = [];

  for (const target of planned) {
    if (check) {
      const reason = drift(repoRoot, target);

      if (reason === null) {
        ok(`${target.name} — ${target.file}`, 'in sync');
      } else {
        fail(`${target.name} — ${target.file}`, reason);
        stale.push(target.name);
      }

      continue;
    }

    ok(`${target.name} — ${target.file}`, write(repoRoot, target) ? 'written' : 'unchanged');
  }

  line();

  if (stale.length > 0) {
    fail(`${stale.join(' and ')} out of sync with packages/contracts/schema/`);
    hint('run `pnpm contracts:generate` and commit what it writes');
    return 1;
  }

  ok(check ? 'both targets match the schema' : 'both targets generated');
  line(dim('generated files are committed — the Dart is what the mobile build reads'));

  return 0;
}

process.exitCode = main();
