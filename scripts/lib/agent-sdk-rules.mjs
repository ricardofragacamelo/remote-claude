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
  /** @type {Scanner} */
  const scanner = { source, blankStrings, out: [], state: 'code', previous: '' };

  for (let index = 0; index < source.length;) {
    index += SCANNERS[scanner.state](scanner, index);
  }

  return scanner.out.join('');
}

/**
 * Where the scan of [withoutComments] stands: what it has written, what it is inside of, and the
 * last character of code that was not whitespace.
 *
 * @typedef {'code' | 'line' | 'block' | 'single' | 'double' | 'template' | 'regex'} ScanState
 * @typedef {object} Scanner
 * @property {string} source
 * @property {boolean} blankStrings
 * @property {string[]} out
 * @property {ScanState} state
 * @property {string} previous
 */

/**
 * One state of the scan: reads the character at [index], writes what it becomes, may move the
 * scan to another state, and answers how many characters it consumed.
 *
 * @typedef {(scanner: Scanner, index: number) => number} ScanStep
 */

/** @type {ReadonlyMap<string, ScanState>} */
const OPENING_QUOTES = new Map([
  ["'", 'single'],
  ['"', 'double'],
  ['`', 'template'],
]);

/** @type {Readonly<Record<string, string>>} */
const CLOSING_DELIMITERS = { single: "'", double: '"', template: '`', regex: '/' };

/**
 * Code: a comment, a string or a regular expression may begin here; anything else is copied.
 *
 * @type {ScanStep}
 */
function scanCode(scanner, index) {
  const character = scanner.source.charAt(index);
  const next = scanner.source.charAt(index + 1);

  if (character === '/' && (next === '/' || next === '*')) {
    scanner.state = next === '/' ? 'line' : 'block';
    scanner.out.push(' ', ' ');
    return 2;
  }

  if (character === '/' && startsAValue(scanner.previous)) {
    scanner.state = 'regex';
  } else {
    scanner.state = OPENING_QUOTES.get(character) ?? 'code';
  }

  scanner.out.push(character);
  if (character.trim() !== '') {
    scanner.previous = character;
  }
  return 1;
}

/**
 * A `//` comment, which the end of its line closes.
 *
 * @type {ScanStep}
 */
function scanLineComment(scanner, index) {
  const character = scanner.source.charAt(index);

  if (character === '\n') {
    scanner.state = 'code';
  }
  scanner.out.push(character === '\n' ? '\n' : ' ');
  return 1;
}

/**
 * A block comment, which only its `*` + `/` closes.
 *
 * @type {ScanStep}
 */
function scanBlockComment(scanner, index) {
  const character = scanner.source.charAt(index);

  if (character === '*' && scanner.source[index + 1] === '/') {
    scanner.state = 'code';
    scanner.out.push(' ', ' ');
    return 2;
  }
  scanner.out.push(character === '\n' ? '\n' : ' ');
  return 1;
}

/**
 * An escape inside a string or a regular expression: the backslash and the character it swallows,
 * blanked together — except a newline, which always stays one.
 *
 * @type {ScanStep}
 */
function scanEscape(scanner, index) {
  const { source, blankStrings, out } = scanner;
  const escaped = source.charAt(index + 1);

  out.push(blankStrings ? ' ' : '\\', blankStrings && escaped !== '\n' ? ' ' : escaped);
  return 2;
}

/**
 * Inside a string or a regular expression. An escape swallows the next character, so a closing
 * quote that is escaped does not close anything.
 *
 * @type {ScanStep}
 */
function scanLiteral(scanner, index) {
  const { source, blankStrings, out, state } = scanner;
  const character = source.charAt(index);

  if (character === '\\') {
    return scanEscape(scanner, index);
  }

  const closes =
    character === CLOSING_DELIMITERS[state] ||
    // An unterminated string does not run past its line, and neither should this.
    (state !== 'template' && character === '\n');

  // The delimiters stay even when the contents go, so the result still parses as code to a
  // reader — and so a lost quote cannot make the next line look like the inside of a string.
  out.push(blankStrings && !closes ? ' ' : character);

  if (closes) {
    scanner.state = 'code';
    scanner.previous = character === '\n' ? scanner.previous : 'x';
  }
  return 1;
}

/** @type {Readonly<Record<ScanState, ScanStep>>} */
const SCANNERS = {
  code: scanCode,
  line: scanLineComment,
  block: scanBlockComment,
  single: scanLiteral,
  double: scanLiteral,
  template: scanLiteral,
  regex: scanLiteral,
};

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
 * The doors of plan 13 — every way an extension of Claude could reach a session past the backend's
 * composition, each a pattern and the reason it fails (ADR-018).
 *
 * `view` says which reading of the file the pattern runs on: `code` has comments and strings
 * blanked, so a name explained in prose is never a finding; `strings` keeps the strings, for the
 * names that would arrive as one (a control request's subtype). `only` narrows a rule to the files
 * where the key means the SDK's option.
 *
 * @type {readonly { rule: string, view: 'code' | 'strings', pattern: RegExp, detail: string, only?: RegExp }[]}
 */
const EXTENSION_RULES = [
  {
    rule: 'no-update-settings',
    view: 'code',
    pattern: /(?<![\w$])updateSettings\s*\(/g,
    detail: 'updateSettings() writes a settings file of the user, past canUseTool (ADR-018)',
  },
  {
    rule: 'no-apply-flag-settings',
    view: 'code',
    pattern: /(?<![\w$])applyFlagSettings\s*\(/g,
    detail:
      'applyFlagSettings() mid-session restarts the query and loses the hooks — the flag layer ' +
      'goes in at the start, through flagSettings() (ADR-018, discovery §10.3)',
  },
  {
    rule: 'no-managed-settings',
    view: 'code',
    pattern: /(?<![\w$])managedSettings\s*:/g,
    detail:
      'managedSettings does not hold the shell inline off (measured); the restrictive keys go in ' +
      'through flagSettings() (plan 13, D-24)',
  },
  {
    rule: 'flag-settings-only-through-the-builder',
    view: 'code',
    pattern: /(?<![\w$.])settings\s*:(?!\s*flagSettings\s*\()/g,
    only: /adapter\/outbound\/claude\//,
    detail:
      'the flag layer sits above user and project and takes `permissions`; it is built by ' +
      'flagSettings(), which takes an allowlist of keys and refuses the rest (ADR-018)',
  },
  {
    rule: 'no-mcp-tool-policy',
    view: 'strings',
    pattern: /\b(?:permission_policy|alwaysLoad)\b/g,
    detail:
      "an MCP server's permission_policy: 'always_allow' approves its tools without canUseTool; " +
      'neither it nor alwaysLoad is ever configured (ADR-018)',
  },
  {
    rule: 'plugin-needs-skip-mcp-discovery',
    view: 'code',
    pattern: /(?<![\w$])skipMcpDiscovery\s*:(?!\s*true\b)/g,
    detail:
      'a plugin brings its own MCP servers; skipMcpDiscovery: true keeps them for the approval of ' +
      'plan 13, F2 (ADR-018)',
  },
  {
    rule: 'no-private-control-request',
    view: 'strings',
    pattern: /\b(?:get_hooks_listing|list_permission_rules|get_settings)\b/g,
    detail:
      'a control request with no public method on Query changes without notice; read the ' +
      'published files instead (plan 13, D-16)',
  },
];

/** A local plugin, in an object literal: what must carry `skipMcpDiscovery: true` beside it. */
const LOCAL_PLUGIN = /type\s*:\s*['"]local['"]/g;

/**
 * The text of the object literal around [index] — from its `{` to the `}` that closes it.
 *
 * @param {string} source
 * @param {number} index
 * @returns {string}
 */
export function enclosingObject(source, index) {
  let depth = 0;
  let open = -1;

  for (let at = index; at >= 0; at -= 1) {
    if (source[at] === '}') {
      depth += 1;
    } else if (source[at] === '{') {
      if (depth === 0) {
        open = at;
        break;
      }
      depth -= 1;
    }
  }

  if (open === -1) {
    return source.slice(0, index);
  }

  const close = argumentsAt(source.replaceAll('{', '(').replaceAll('}', ')'), open);
  return source.slice(open + 1, open + 1 + close.length);
}

/**
 * The findings of the extension rules in one file.
 *
 * @param {string} file
 * @param {{ code: string, strings: string }} views
 * @returns {Finding[]}
 */
function extensionFindings(file, views) {
  /** @type {Finding[]} */
  const findings = [];

  for (const { rule, view, pattern, detail, only } of EXTENSION_RULES) {
    if (only !== undefined && !only.test(file)) {
      continue;
    }
    for (const match of views[view].matchAll(pattern)) {
      findings.push({ rule, file, line: lineAt(views[view], match.index), detail });
    }
  }

  for (const match of views.strings.matchAll(LOCAL_PLUGIN)) {
    if (!/skipMcpDiscovery\s*:\s*true\b/.test(enclosingObject(views.strings, match.index))) {
      findings.push({
        rule: 'plugin-needs-skip-mcp-discovery',
        file,
        line: lineAt(views.strings, match.index),
        detail: "a { type: 'local' } plugin without skipMcpDiscovery: true starts its MCP servers",
      });
    }
  }

  return findings;
}

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

    if (!/strictMcpConfig\s*:\s*true\b/.test(args)) {
      findings.push({
        rule: 'query-needs-strict-mcp-config',
        file,
        line,
        detail:
          "query() without strictMcpConfig: true starts the repository's own .mcp.json — which it " +
          'can approve itself —, its plugins and the claude.ai connectors (ADR-018)',
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

  findings.push(...extensionFindings(file, { code: calls, strings: source }));

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
