#!/usr/bin/env node
/**
 * `smoke-live`, with its failure reported as an issue instead of left in one terminal
 * (plan 05, B-19).
 *
 * | the suite | what happens                                                          | exit |
 * |-----------|-----------------------------------------------------------------------|------|
 * | passes    | nothing — no issue opened, none closed, `gh` not even called           | 0    |
 * | fails     | an issue labelled `smoke-live`, or a comment on the one already open   | 0    |
 * | fails, and the issue cannot be written | red, which is the only signal left       | 1    |
 *
 * The suite's own failure exits 0 **once it is reported**: the issue is the signal, and a red exit
 * beside it would be the same news twice. What may never happen is a failure reported nowhere.
 *
 * On demand, never on a schedule: there is no Claude credential in CI (D-12 of plan 01, kept by
 * D-11 of plan 05). The stack is `run-e2e-local.mjs`'s, with random ports and a compose project
 * owned by the run, so it can run beside any other run on the same machine (S-40).
 *
 * Usage: `pnpm test:e2e:live:report` · `… -- <command>` runs another command as the suite (what
 * the suite of this script does). Needs `gh`, authenticated.
 */

import path from 'node:path';
import process from 'node:process';

import { run, runAttached } from './lib/exec.mjs';
import { ghArgs, LIST_ARGS, parseIssues, planReport } from './lib/smoke-report.mjs';
import { repoRoot } from './lib/paths.mjs';
import { fail, hint, info, ok, title } from './lib/ui.mjs';

/** A real run takes minutes of a real model, on top of the stack. */
const TIMEOUT_MS = 2_400_000;

/** @returns {string[]} the command that is the suite */
function suiteCommand() {
  const separator = process.argv.indexOf('--');
  return separator === -1
    ? [process.execPath, path.join(repoRoot, 'scripts', 'run-smoke-live.mjs')]
    : process.argv.slice(separator + 1);
}

/** @returns {string | null} the CI run, when this is one */
function runUrl() {
  const {
    GITHUB_SERVER_URL: server,
    GITHUB_REPOSITORY: repository,
    GITHUB_RUN_ID: id,
  } = process.env;

  return server && repository && id ? `${server}/${repository}/actions/runs/${id}` : null;
}

/**
 * @param {number} exitCode of the suite
 * @returns {number}
 */
function report(exitCode) {
  const listed = run('gh', LIST_ARGS, { cwd: repoRoot });
  const issues = listed.code === 0 ? parseIssues(listed.stdout) : null;

  if (issues === null) {
    fail('the suite failed, and the issue tracker could not be read', listed.stderr.trim());
    hint('install gh and run `gh auth login` — a failure reported nowhere is lost');
    return 1;
  }

  const action = planReport(
    { exitCode, date: new Date().toISOString().slice(0, 10), runUrl: runUrl() },
    issues,
  );
  // A failed run always plans an issue or a comment; `none` is only ever the answer to a pass.
  const args = ghArgs(action) ?? [];
  const written = run('gh', args, { cwd: repoRoot });

  if (written.code !== 0) {
    fail('the suite failed, and the issue could not be written', written.stderr.trim());
    return 1;
  }

  ok(action.kind === 'comment' ? `commented on #${String(action.number)}` : 'issue opened');
  return 0;
}

function main() {
  title('smoke-live against the real Claude, reported as an issue');

  const [command = '', ...args] = suiteCommand();
  const suite = runAttached(command, args, { cwd: repoRoot, timeoutMs: TIMEOUT_MS });

  if (suite.code === 0) {
    ok('smoke-live passed', 'nothing to report');
    return 0;
  }

  info(`smoke-live exited with ${String(suite.code)} — reporting it`);
  return report(suite.code);
}

process.exitCode = main();
