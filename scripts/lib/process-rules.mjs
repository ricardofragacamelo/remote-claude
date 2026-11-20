/**
 * The shell-is-forbidden rules of ADR-016.
 *
 * The search feature (plan 11) is the first place this backend runs a program that is not the
 * Claude Agent SDK, with input the user typed — pattern, glob, path, replacement text. A shell in
 * the middle turns that input into a command, which is exactly what `shell: false` and an argv
 * array exist to prevent. No generic scanner knows this is the one rule this backend cannot ever
 * relax, which is why it is written here rather than left to `semgrep` alone.
 *
 * See docs/architecture/shared/00-decisions.md (ADR-016).
 */

import { argumentsAt, lineAt, withoutComments } from './agent-sdk-rules.mjs';
import { inspectAll as inspectWith } from './source-rules.mjs';

/** @typedef {import('./source-rules.mjs').Finding} Finding */

/** `shell: true` anywhere — the one setting this product never ships. */
const SHELL_TRUE = /\bshell\s*:\s*true\b/g;

/** `exec(` and `execSync(`: both always run their argument through a shell. */
const EXEC_CALL = /(?<![.?\w$])exec(Sync)?\s*\(/g;

/** `spawn(`: safe only with an argv array as the second argument. */
const SPAWN_CALL = /(?<![.?\w$])(spawn)\s*\(/g;

/**
 * The findings of one file.
 *
 * @param {string} file
 * @param {string} rawSource
 * @returns {Finding[]}
 */
export function inspectSource(file, rawSource) {
  /** @type {Finding[]} */
  const findings = [];
  const source = withoutComments(rawSource);

  for (const match of source.matchAll(SHELL_TRUE)) {
    findings.push({
      rule: 'no-shell-true',
      file,
      line: lineAt(source, match.index),
      detail:
        'shell: true hands the argument string to a shell, which is how argument injection happens',
    });
  }

  for (const match of source.matchAll(EXEC_CALL)) {
    const name = match[1] ? 'execSync' : 'exec';
    findings.push({
      rule: name === 'execSync' ? 'no-exec-sync' : 'no-exec',
      file,
      line: lineAt(source, match.index),
      detail: `${name}() always runs its argument through a shell; use execFile() or spawn() with an argv array`,
    });
  }

  for (const match of source.matchAll(SPAWN_CALL)) {
    const open = match.index + match[0].length - 1;
    const args = argumentsAt(source, open);

    if (!args.includes(',')) {
      findings.push({
        rule: 'no-single-string-command',
        file,
        line: lineAt(source, match.index),
        detail: `${match[1]}() called with a single argument builds one command line instead of an argv array`,
      });
    }
  }

  return findings;
}

/**
 * Inspects a set of files.
 *
 * @param {readonly { file: string, source: string }[]} files
 * @returns {Finding[]}
 */
export function inspectAll(files) {
  return inspectWith(files, inspectSource);
}
