#!/usr/bin/env node
/**
 * The database, in one command: `migrate`, `reset` and `seed`.
 *
 * `reset` is the one that gets used every day — drop, recreate, migrate, populate — and it is
 * exactly the sequence nobody remembers in the right order.
 *
 * The work itself is the backend's: the migrations live there, and one implementation of "bring
 * the schema up to date" serves both the boot and this command. This file is the door, and the
 * honest exit code.
 *
 * Usage: `pnpm db migrate` · `pnpm db reset` · `pnpm db seed`
 */

import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import { runAttached } from './lib/exec.mjs';
import { loadDotEnv } from './lib/stack.mjs';
import { fail, fatal, hint, ok, title } from './lib/ui.mjs';

/**
 * What each command does, for the usage message and for the check below.
 *
 * @type {Record<string, string>}
 */
const COMMANDS = {
  migrate: 'applies every migration that has not run yet',
  reset: 'drops the schema, recreates it, migrates and seeds',
  seed: 'plants the demo data; running it twice changes nothing',
};

const command = process.argv[2];

if (command === undefined || !Object.hasOwn(COMMANDS, command)) {
  fatal(`usage: pnpm db <${Object.keys(COMMANDS).join(' | ')}>`);
  for (const [name, description] of Object.entries(COMMANDS)) {
    hint(`${name.padEnd(8)} ${description}`);
  }
  process.exit(2);
}

title(`db — ${command}`);

// Compose loads `.env` on its own; node does not, and the connection string lives there.
loadDotEnv(repoRoot);

const result = runAttached(
  'pnpm',
  ['--filter', './backend', 'exec', 'tsx', 'src/infrastructure/database/cli.ts', command],
  {
    cwd: repoRoot,
    timeoutMs: 300_000,
  },
);

if (result.code !== 0) {
  fail(`${command} failed with exit ${String(result.code)}`);
  hint('is the stack up? `pnpm dev` brings PostgreSQL with it');
  hint('DATABASE_URL is what this reads — check it in `.env`');
  process.exit(result.code);
}

ok(command, COMMANDS[command]);
