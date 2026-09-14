#!/usr/bin/env node
/**
 * Reclaims what accumulates: orphan compose projects and their **named volumes**, plus the build
 * and report directories.
 *
 * The orphan volume is what justifies the script. When a run dies abruptly the containers go and
 * the named volume survives — and it is invisible to `docker compose ls`, which lists projects,
 * not leftovers. Nothing else ever removes it, so the disk fills up over weeks.
 *
 * The development stack is never touched: `pnpm dev` keeps its database on purpose, and a clean
 * command that silently drops it would make `pnpm clean` something people avoid running.
 *
 * Usage: `pnpm clean` · `pnpm clean --dry-run`
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { purgeStaleProjects, resolveComposeCli } from './lib/compose.mjs';
import { findDisposable } from './lib/disposable.mjs';
import { run } from './lib/exec.mjs';
import { PROJECT_PREFIX, projectName } from './lib/stack.mjs';
import { dim, fail, hint, info, line, ok, title, warn } from './lib/ui.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const project = projectName(process.env);

function main() {
  title(`clean — ${dryRun ? 'dry run' : 'reclaim disk'}`);

  const cli = resolveComposeCli((command, args) => run(command, args, { timeoutMs: 20_000 }));

  if (cli === null) {
    warn('docker compose is not available', 'skipping projects and volumes');
    hint('install the Compose v2 plugin (docker-compose-plugin) or the docker-compose binary');
  } else if (dryRun) {
    info('docker is left alone in a dry run — listing containers cannot preview a removal');
  } else {
    const report = purgeStaleProjects(
      (command, args) => run(command, args, { timeoutMs: 120_000 }),
      cli,
      { prefix: PROJECT_PREFIX, keep: [project] },
    );

    describe('compose project', report.projects);
    describe('orphan volume', report.volumes);

    for (const failure of report.failures) {
      fail(failure);
    }

    if (report.failures.length > 0) {
      return 1;
    }
  }

  const directories = findDisposable(repoRoot);

  for (const relative of directories) {
    if (!dryRun) {
      fs.rmSync(path.join(repoRoot, relative), { recursive: true, force: true });
    }
    ok(relative, dryRun ? 'would be removed' : 'removed');
  }

  line();
  if (directories.length === 0) {
    ok('nothing to reclaim');
  }
  line(dim(`the ${project} development stack and its volumes are never touched`));

  return 0;
}

/**
 * @param {string} what
 * @param {readonly string[]} names
 */
function describe(what, names) {
  for (const name of names) {
    ok(`${what} ${name}`, 'removed');
  }
}

process.exitCode = main();
