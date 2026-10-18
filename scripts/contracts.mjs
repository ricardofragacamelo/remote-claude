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
import { checkRoutes } from './lib/contracts-routes.mjs';
import { dim, fail, hint, line, ok, title } from './lib/ui.mjs';

const check = process.argv.includes('--check');

/**
 * The files the schema turns into, or null — already reported — when the schema cannot be read.
 *
 * @returns {import('./lib/contracts-io.mjs').Target[] | null}
 */
function plannedTargets() {
  try {
    return targets(repoRoot);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    if (error instanceof ContractError) {
      hint(
        'the generator accepts object, string, integer, boolean, array, enum, const and a $ref to definitions/',
      );
    }
    return null;
  }
}

/**
 * Reports whether one generated file still matches the schema, and answers whether it is stale.
 *
 * @param {import('./lib/contracts-io.mjs').Target} target
 * @returns {boolean}
 */
function isStale(target) {
  const reason = drift(repoRoot, target);

  if (reason === null) {
    ok(`${target.name} — ${target.file}`, 'in sync');
    return false;
  }

  fail(`${target.name} — ${target.file}`, reason);
  return true;
}

/**
 * Reports every HTTP route the backend registers with no schema and no documented exception, and
 * every schema or exception naming a route that does not exist (plan 28, B-48). Only meaningful
 * for `--check`: the route table is read from the controllers, never generated, so there is
 * nothing for `pnpm contracts:generate` to write for it.
 *
 * @returns {boolean} whether every route and schema agree
 */
function routesOk() {
  const problems = checkRoutes(repoRoot);

  if (problems.length === 0) {
    ok('routes — every one has a schema or a documented exception');
    return true;
  }

  for (const problem of problems) {
    fail(`${problem.method} ${problem.path}`, problem.detail);
  }
  hint(
    'add "x-route" to the schema that answers the route, or an entry (with a reason) to scripts/contracts-route-exceptions.json',
  );

  return false;
}

/**
 * Generates or checks every planned target, and answers the names of the ones out of sync — empty
 * while generating, since writing one always leaves it in sync.
 *
 * @param {import('./lib/contracts-io.mjs').Target[]} planned
 * @returns {string[]}
 */
function syncTargets(planned) {
  /** @type {string[]} */
  const stale = [];

  for (const target of planned) {
    if (!check) {
      ok(`${target.name} — ${target.file}`, write(repoRoot, target) ? 'written' : 'unchanged');
    } else if (isStale(target)) {
      stale.push(target.name);
    }
  }

  return stale;
}

function main() {
  title(`contracts — ${check ? 'check' : 'generate'}`);

  const planned = plannedTargets();
  if (planned === null) {
    return 1;
  }

  const stale = syncTargets(planned);
  const routesPass = check ? routesOk() : true;

  line();

  if (stale.length > 0) {
    fail(`${stale.join(' and ')} out of sync with packages/contracts/schema/`);
    hint('run `pnpm contracts:generate` and commit what it writes');
    return 1;
  }

  if (!routesPass) {
    fail('one or more HTTP routes and their schemas disagree');
    return 1;
  }

  ok(check ? 'both targets match the schema' : 'both targets generated');
  line(dim('generated files are committed — the Dart is what the mobile build reads'));

  return 0;
}

process.exitCode = main();
