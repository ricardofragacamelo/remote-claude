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

/**
 * @typedef {object} Finding
 * @property {string} rule
 * @property {string} file
 * @property {number} line 1-based
 * @property {string} detail what is wrong, and what it costs
 */

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
 * @param {string} source
 * @returns {Finding[]}
 */
export function inspectSource(file, source) {
  /** @type {Finding[]} */
  const findings = [];

  for (const match of source.matchAll(QUERY_CALL)) {
    const open = match.index + match[0].length - 1;
    const args = argumentsAt(source, open);
    const line = lineAt(source, match.index);

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
  return files.flatMap((entry) => inspectSource(entry.file, entry.source));
}
