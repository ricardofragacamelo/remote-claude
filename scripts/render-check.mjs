#!/usr/bin/env node
/**
 * The parity of form between the conversation of the web and the app's (plan 26, B-05).
 *
 *   node scripts/render-check.mjs        # pnpm render:check
 *
 * Reads `scripts/render-parity.json` and fails when a component of the web's conversation, or a label
 * of a tool, has no entry; when an `ok` entry names a widget or a test the app does not have; when a
 * `pending` entry outlived the phase that promised it, or any is left once the map allows none; and
 * when an `excluded` entry names a decision that is not ✅. What is still pending is listed by phase,
 * for whoever closes it next. It writes nothing. Part of gate 11 (D-12).
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { filesUnder } from './lib/files.mjs';
import { repoRoot } from './lib/paths.mjs';
import { checkParity, decisionStates, labelKeysIn, phaseStates } from './lib/render-parity.mjs';
import { dim, fail, line, ok, title } from './lib/ui.mjs';

const MAP = path.join(repoRoot, 'scripts', 'render-parity.json');
const PLAN = path.join(repoRoot, 'docs', 'plans', '26-mobile-conversation-parity');

/** @param {string} relative */
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

function main() {
  title('render-check — the conversation of the app against the web’s');

  /** @type {import('./lib/render-parity.mjs').ParityMap} */
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const webFiles = map.webRoots.flatMap((root) =>
    filesUnder(path.join(repoRoot, root), ['.tsx']).map((file) =>
      path.relative(repoRoot, file).split(path.sep).join('/'),
    ),
  );

  const { problems, pending, entries } = checkParity(map, {
    webFiles,
    labelKeys: map.labelSources.flatMap((source) => labelKeysIn(read(source), map.labelPattern)),
    exists: (file) => fs.existsSync(path.join(repoRoot, file)),
    contentOf: read,
    decisions: decisionStates(fs.readFileSync(path.join(PLAN, 'decisions.md'), 'utf8')),
    phases: phaseStates(fs.readFileSync(path.join(PLAN, 'progress.md'), 'utf8')),
  });

  for (const [phase, elements] of pending) {
    line(dim(`pending ${phase} (${String(elements.length)}): ${elements.join(', ')}`));
  }

  if (problems.length > 0) {
    for (const each of problems) {
      fail(`${each.kind} · ${each.subject}`, each.detail);
    }
    return 1;
  }

  ok('every element of the conversation has its pair', `${String(entries)} entries`);
  return 0;
}

process.exitCode = main();
