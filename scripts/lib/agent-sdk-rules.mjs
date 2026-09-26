/**
 * The security rules that are specific to this product.
 *
 * They exist because a spike showed the hole opens **in silence**: neither an omitted
 * `settingSources` nor a missing `PreToolUse` hook produces an error or a warning. They simply
 * turn the protection off, and the process keeps running exactly as it did.
 *
 * No generic scanner knows about any of this, which is why the checks are written here rather
 * than configured somewhere. See docs/architecture/shared/00-decisions.md (ADR-011) and
 * docs/architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources.
 */

import { inspectAll as inspectWith } from './source-rules.mjs';

/** @typedef {import('./source-rules.mjs').Finding} Finding */

/**
 * The text between the parentheses of the call starting at [open].
 *
 * Balanced rather than regular, because an `Options` object nests: a regular expression that
 * stops at the first `)` reads half a call and draws a conclusion from it.
 *
 * @param {string} source
 * @param {number} open index of the `(`
 * @returns {string}
 */
export function argumentsAt(source, open) {
  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    const character = source[index];

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }

  return source.slice(open + 1);
}

/**
 * The 1-based line an index falls on.
 *
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
export function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * The source with its comments blanked out, and everything else untouched.
 *
 * Each removed character becomes a space and each newline stays a newline, so a finding still
 * points at the line it came from.
 *
 * It exists because the rules below look for a **call**, and prose is not one. This project
 * explains the SDK at length, and several of those explanations quote `query()` by name; a gate
 * that reported them is a gate everybody learns to scroll past, which is worse than not having
 * one. It costs nothing the other way: a real call is never inside a comment.
 *
 * Quotes are tracked either way, because a `//` inside a string is not a comment — `'https://x'`
 * is the ordinary case. So are regular-expression literals, by the usual heuristic: a `/` opens
 * one only where a value could begin. Without that, a pattern containing a quote would leave the
 * scanner believing it was inside a string for the rest of the file.
 *
 * `blankStrings` decides what happens to the strings themselves, and the caller needs it both
 * ways. To find a **call**, strings have to go: `'call query() first'` is prose. To read what a
 * call was given, they have to stay: the very thing the rules require is
 * `settingSources: ['project']`, and blanking that would report every compliant call as a
 * violation. Both passes keep every position, so one can locate what the other reads.
 *
 * @param {string} source
 * @param {boolean} [blankStrings]
 * @returns {string}
 */
export function withoutComments(source, blankStrings = false) {
  /** @type {string[]} */
  const out = [];
  /** @type {'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex'} */
  let state = 'code';
  let previous = '';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (state === 'code') {
      if (character === '/' && (next === '/' || next === '*')) {
        state = next === '/' ? 'line' : 'block';
        out.push(' ', ' ');
        index += 1;
        continue;
      }

      if (character === '/' && startsAValue(previous)) {
        state = 'regex';
      } else if (character === "'" || character === '"' || character === '`') {
        state = character === "'" ? 'single' : character === '"' ? 'double' : 'template';
      }

      out.push(character);
      if (character.trim() !== '') {
        previous = character;
      }
      continue;
    }

    if (state === 'line' || state === 'block') {
      const ends = state === 'line' ? character === '\n' : character === '*' && next === '/';

      if (ends && state === 'block') {
        state = 'code';
        out.push(' ', ' ');
        index += 1;
        continue;
      }
      if (ends) {
        state = 'code';
      }

      out.push(character === '\n' ? '\n' : ' ');
      continue;
    }

    // Inside a string or a regular expression. An escape swallows the next character, so a
    // closing quote that is escaped does not close anything.
    if (character === '\\') {
      const escaped = source[index + 1] ?? '';
      out.push(blankStrings ? ' ' : character, blankStrings && escaped !== '\n' ? ' ' : escaped);
      index += 1;
      continue;
    }

    const closes =
      (state === 'single' && character === "'") ||
      (state === 'double' && character === '"') ||
      (state === 'template' && character === '`') ||
      (state === 'regex' && character === '/') ||
      // An unterminated string does not run past its line, and neither should this.
      (state !== 'template' && character === '\n');

    // The delimiters stay even when the contents go, so the result still parses as code to a
    // reader — and so a lost quote cannot make the next line look like the inside of a string.
    out.push(blankStrings && !closes ? ' ' : character);

    if (closes) {
      state = 'code';
      previous = character === '\n' ? previous : 'x';
    }
  }

  return out.join('');
}

/**
 * Whether a `/` after this character begins a regular expression rather than a division.
 *
 * @param {string} character
 * @returns {boolean}
 */
function startsAValue(character) {
  return character === '' || '(,=:[!&|?{};+-*%<>~^'.includes(character);
}

/**
 * A call to the Agent SDK's `query`.
 *
 * Bare only: the SDK is imported as `import { query } from '@anthropic-ai/claude-agent-sdk'`,
 * and a member call — `client.query(sql)` on a database pool — is a different function that
 * happens to share the name. The first run of this rule found exactly that, in the migrator.
 */
const QUERY_CALL = /(?<![.?\w$])query\s*\(/g;

/** The flag that turns the permission prompt off wholesale. */
const SKIP_PERMISSIONS = /allowDangerouslySkipPermissions\s*:\s*(?!false\b)([A-Za-z0-9_.]+)/g;

/** The mode that answers every permission with yes. */
const BYPASS_MODE = /permissionMode\s*:\s*['"]bypassPermissions['"]/g;

/**
 * Inspects one source file.
 *
 * @param {string} file path to report
 * @param {string} rawSource the file as it is on disk, comments and all
 * @returns {Finding[]}
 */
export function inspectSource(file, rawSource) {
  /** @type {Finding[]} */
  const findings = [];

  // Two views of the same file, both keeping every position. Calls are looked for in the one
  // without strings, because `'call query() first'` is prose; what a call was given is read from
  // the one that keeps them, because `settingSources: ['project']` is a string.
  const source = withoutComments(rawSource);
  const calls = withoutComments(rawSource, true);

  for (const match of calls.matchAll(QUERY_CALL)) {
    const open = match.index + match[0].length - 1;
    const args = argumentsAt(source, open);
    const line = lineAt(calls, match.index);

    if (!/settingSources\s*:\s*\[\s*['"]project['"]/.test(args)) {
      findings.push({
        rule: 'query-needs-project-setting-sources',
        file,
        line,
        detail:
          "query() without settingSources: ['project'] loads the user scope and turns canUseTool " +
          'off, with no error and no warning',
      });
    }

    if (!/PreToolUse/.test(args)) {
      findings.push({
        rule: 'query-needs-pretooluse-hook',
        file,
        line,
        detail: 'query() without hooks.PreToolUse leaves no audit trail of what was executed',
      });
    }

    if (!/canUseTool\s*:/.test(args)) {
      findings.push({
        rule: 'query-needs-can-use-tool',
        file,
        line,
        detail:
          'query() without canUseTool hands the decision to the CLI, which runs whatever it ' +
          'classifies as safe with nobody asked',
      });
    }
  }

  for (const match of source.matchAll(SKIP_PERMISSIONS)) {
    findings.push({
      rule: 'no-skip-permissions',
      file,
      line: lineAt(source, match.index),
      detail: `allowDangerouslySkipPermissions is ${String(match[1])}; it may only ever be false`,
    });
  }

  for (const match of source.matchAll(BYPASS_MODE)) {
    findings.push({
      rule: 'no-bypass-permission-mode',
      file,
      line: lineAt(source, match.index),
      detail: "permissionMode: 'bypassPermissions' answers every permission request with yes",
    });
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
