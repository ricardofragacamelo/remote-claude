#!/usr/bin/env node
/**
 * The gates of one workspace, in protocol order.
 *
 * `pnpm --filter backend verify` and `pnpm --filter web verify` both land here. The repository-wide
 * `pnpm verify` of F7 is the same list over every workspace at once; having one implementation is
 * what keeps a gate from existing on one end and not the other.
 *
 * Usage: `node scripts/verify-workspace.mjs <workspace>`
 */

import process from 'node:process';

import { repoRoot } from './lib/paths.mjs';
import { declaredScripts, runGates } from './lib/gates.mjs';
import { reportOutcome, reportVerdict } from './lib/verify.mjs';
import { fatal, title } from './lib/ui.mjs';

const workspace = process.argv[2];

if (workspace === undefined || workspace === '') {
  fatal('usage: node scripts/verify-workspace.mjs <workspace>');
  process.exit(2);
}

if (declaredScripts(repoRoot, workspace).size === 0) {
  fatal(`${workspace} has no package.json — nothing to verify`);
  process.exit(2);
}

title(`verify — ${workspace}`);

const outcomes = runGates(repoRoot, workspace, reportOutcome);

process.exit(
  reportVerdict(outcomes, {
    headline: 'all gates green',
    detail: `${workspace} is done as far as this workspace can tell`,
  }),
);
