#!/usr/bin/env node
/**
 * The database, in one command: `migrate`, `purge`, `reset` and `seed`.
 *
 * `reset` is the one that gets used every day — drop, recreate, migrate, populate — and it is
 * exactly the sequence nobody remembers in the right order.
 *
 * `purge` cuts the audit trail back to its retention window. It is the backend's own job, run by
 * hand: the same routine, under the same lock, recorded as `cli` where the job says `job`
 * (docs/plans/03-rules-and-audit/F3-retention.md). It exits non-zero when anything outside the
 * window could not be removed, and says what.
 *
 * The work itself is the backend's: the migrations and the purge live there, and one
 * implementation of each serves both the backend and this command. This file is the door, and the
 * honest exit code.
 *
 * Usage: `pnpm db migrate` · `pnpm db purge` · `pnpm db reset` · `pnpm db seed`
 */

import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import { runAttached, runReporting } from './lib/exec.mjs';
import { describePurge, parsePurgeReport } from './lib/purge-report.mjs';
import { loadDotEnv } from './lib/stack.mjs';
import { fail, fatal, hint, ok, title, warn } from './lib/ui.mjs';

/**
 * What each command does, for the usage message and for the check below.
 *
 * @type {Record<string, string>}
 */
const COMMANDS = {
  migrate: 'applies every migration that has not run yet',
  purge: 'removes the audit trail older than the retention window, and records what it removed',
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

const backendCommand = [
  '--filter',
  './backend',
  'exec',
  'tsx',
  'src/infrastructure/database/cli.ts',
  command,
];

if (command === 'purge') {
  purge();
} else {
  const result = runAttached('pnpm', backendCommand, { cwd: repoRoot, timeoutMs: 300_000 });

  if (result.code !== 0) {
    fail(`${command} failed with exit ${String(result.code)}`);
    hint('is the stack up? `pnpm dev` brings PostgreSQL with it');
    hint('DATABASE_URL is what this reads — check it in `.env`');
    process.exit(result.code);
  }

  ok(command, COMMANDS[command]);
}

/**
 * Runs the purge and says what it did, line by line.
 *
 * The report arrives on stdout and the log on stderr, which goes straight to the terminal. The
 * exit code is the backend command's: a purge that left rows outside the window behind is not a
 * success, however much it removed first.
 */
function purge() {
  // Long, because the first purge of an installation that never purged may have months to remove.
  const result = runReporting('pnpm', backendCommand, { cwd: repoRoot, timeoutMs: 3_600_000 });
  const report = parsePurgeReport(result.stdout);

  if (report === null) {
    fail(`purge failed with exit ${String(result.code)}, without a report`);
    hint(
      'the configuration is the usual suspect: RC_AUDIT_RETENTION_DAYS and DATABASE_URL in `.env`',
    );
    process.exit(result.code === 0 ? 1 : result.code);
  }

  const render = { ok, fail, warn, hint };
  for (const reportLine of describePurge(report)) {
    render[reportLine.kind](reportLine.text);
  }

  process.exit(result.code);
}
