import type { CanonicalTool, ToolSubject } from '@domain/engine';
import type { PermissionDecision } from '../entities/permission-request.entity';
import { PermissionRulePatternInvalidError } from '../errors/permission-rule-pattern-invalid.error';
import { PermissionRuleToolInteractiveError } from '../errors/permission-rule-tool-interactive.error';
import { HUMAN_ONLY_KINDS } from './mode-approval';
import { hasGlob, locatePath, pathMatcherCovers } from './rule-path';
import { hasShellOperator, shellSegments } from './shell-syntax';

/**
 * The kinds a rule can name (plan 28, B-31, D-11). Every other kind — a question, a plan, the task
 * list, a command's output, `other`, one the core does not know — takes no rule: it always asks.
 */
export const RULE_KINDS = [
  'shell',
  'file.read',
  'file.edit',
  'file.write',
  'file.delete',
  'file.move',
  'search',
  'web.fetch',
  'web.search',
  'mcp',
  'agent',
] as const;

/** One of the kinds a rule can name. */
export type RuleKind = (typeof RULE_KINDS)[number];

/** Whether [kind] is one a rule can name. */
export function isRuleKind(kind: string): kind is RuleKind {
  return (RULE_KINDS as readonly string[]).includes(kind);
}

/**
 * How far a pattern reaches: every call of the kind, one exact subject, everything under a prefix
 * (a shell command, an MCP server), or the paths a glob covers.
 */
export type RulePatternReach = 'tool' | 'exact' | 'prefix' | 'glob';

/** A pattern, once it has been read. */
export interface RulePattern {
  readonly kind: RuleKind;
  readonly reach: RulePatternReach;

  /**
   * What is matched, without its syntax: the command (without the `:*` of a prefix), the path or
   * glob, the host (lower case, without `domain:`), `server:tool` or the server of `server:*`.
   * Empty for a whole kind.
   */
  readonly content: string;
}

/** Why a pattern is outside the grammar — the `reason` the refusal carries (S-93). */
export type RulePatternProblem =
  | 'syntax'
  | 'unknownKind'
  | 'emptyMatcher'
  | 'parenthesis'
  | 'prefixOutsideShell'
  | 'emptyPrefix'
  | 'matcherNotAllowed'
  | 'domainExpected'
  | 'serverToolExpected';

/** `kind` or `kind(...)`: a kind is lower-case words joined by one dot. */
const PATTERN = /^([a-z]+(?:\.[a-z]+)?)(?:\((.*)\))?$/s;

/** A host a `web.fetch(domain:…)` names: letters, digits, dots and dashes. */
const HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/** `server:tool` of an MCP rule — a server name has no colon. */
const MCP_MATCHER = /^([^:]+):(.+)$/s;

/** The kinds whose matcher is a path. */
const PATH_KINDS: ReadonlySet<RuleKind> = new Set([
  'file.read',
  'file.edit',
  'file.write',
  'file.delete',
  'file.move',
  'search',
]);

type Reading = { readonly pattern: RulePattern } | { readonly problem: RulePatternProblem };

/**
 * Reads a pattern of the canonical grammar (plan 28, D-11) — a rule by kind, never by an engine's
 * name of a tool:
 *
 * | Pattern | Covers |
 * |---|---|
 * | `shell(git status)` | that command line, exactly |
 * | `shell(git status:*)` | that command and whatever continues it at a token boundary |
 * | `file.edit(src/**)` | the paths the glob covers, relative to the folder (`/…` is absolute) |
 * | `search(src)` | searches in that path |
 * | `web.fetch(domain:example.com)` | every page of that host |
 * | `mcp(server:tool)`, `mcp(server:*)` | that tool of that server, or every tool of it |
 * | `file.edit`, `web.search`, `agent`… | every call of the kind |
 *
 * The grammar is ours, and the domain reads it without knowing any engine
 * (docs/architecture/backend/03-modules.md, the `permission` module).
 *
 * @throws {PermissionRulePatternInvalidError} for anything outside the grammar, with the reason
 * @throws {PermissionRuleToolInteractiveError} for a question or a plan, which no rule may answer
 */
export function parseRulePattern(pattern: string): RulePattern {
  const reading = read(pattern);

  if ('problem' in reading) {
    const kind = PATTERN.exec(pattern.trim())?.[1];

    if (kind !== undefined && HUMAN_ONLY_KINDS.has(kind)) {
      throw new PermissionRuleToolInteractiveError(kind);
    }

    throw new PermissionRulePatternInvalidError(pattern, reading.problem);
  }

  return reading.pattern;
}

/** {@link parseRulePattern}, answering `null` for anything outside the grammar. */
export function readRulePattern(pattern: string): RulePattern | null {
  const reading = read(pattern);

  return 'pattern' in reading ? reading.pattern : null;
}

function read(raw: string): Reading {
  const match = PATTERN.exec(raw.trim());
  const kind = match?.[1];

  if (match === null || kind === undefined) {
    return { problem: 'syntax' };
  }

  if (!isRuleKind(kind)) {
    return { problem: 'unknownKind' };
  }

  const inner = match[2];

  if (inner === undefined) {
    return { pattern: { kind, reach: 'tool', content: '' } };
  }

  if (inner.length === 0) {
    // `shell()` is not "every shell": it is a pattern somebody meant to fill in. Reading it as the
    // widest possible rule is exactly the mistake a permission system may not make.
    return { problem: 'emptyMatcher' };
  }

  if (inner.includes(')')) {
    // A pattern that would read back as something other than what was written.
    return { problem: 'parenthesis' };
  }

  return readMatcher(kind, inner);
}

/** The matcher of [kind], read. */
function readMatcher(kind: RuleKind, inner: string): Reading {
  if (kind === 'shell') {
    return readShell(inner);
  }

  if (kind === 'mcp') {
    return readMcp(inner);
  }

  if (inner.endsWith(':*')) {
    // The prefix of a command line exists only for a shell; a path is a glob.
    return { problem: 'prefixOutsideShell' };
  }

  if (PATH_KINDS.has(kind)) {
    return { pattern: { kind, reach: hasGlob(inner) ? 'glob' : 'exact', content: inner } };
  }

  if (kind === 'web.fetch') {
    const host = inner.startsWith('domain:') ? inner.slice('domain:'.length).toLowerCase() : '';

    return HOST.test(host)
      ? { pattern: { kind, reach: 'exact', content: host } }
      : { problem: 'domainExpected' };
  }

  // `web.search` and `agent` have no matcher: every call of them, or none.
  return { problem: 'matcherNotAllowed' };
}

function readShell(inner: string): Reading {
  if (!inner.endsWith(':*')) {
    return { pattern: { kind: 'shell', reach: 'exact', content: inner } };
  }

  const prefix = inner.slice(0, -2);

  // A prefix of nothing would be every command there is.
  return prefix.length === 0
    ? { problem: 'emptyPrefix' }
    : { pattern: { kind: 'shell', reach: 'prefix', content: prefix } };
}

function readMcp(inner: string): Reading {
  const match = MCP_MATCHER.exec(inner);
  const server = match?.[1];
  const tool = match?.[2];

  if (server === undefined || tool === undefined) {
    return { problem: 'serverToolExpected' };
  }

  return tool === '*'
    ? { pattern: { kind: 'mcp', reach: 'prefix', content: server } }
    : { pattern: { kind: 'mcp', reach: 'exact', content: `${server}:${tool}` } };
}

/**
 * Whether a pattern covers a call, for a rule that allows or refuses, in [folder] — the folder the
 * session runs in, which a relative path matcher is read against.
 *
 * A pure rule and no I/O, which is what lets it be tested by boundary. Every matcher reads the
 * call's **subject**, never its raw input: a call whose subject lacks what the matcher names is
 * covered only by the whole kind — an unrecognised shape matches less, never more.
 *
 * **The prefix respects token boundaries.** `shell(git status:*)` covers `git status --short` and
 * does **not** cover `git statusx`.
 *
 * **On a shell line, the decision changes the reading — on purpose, and in the safe direction
 * both times** ([15 · D-07](../../../../../docs/plans/15-rules-management/decisions.md)):
 *
 * - an `allow` **prefix** covers only a line that is one command. `shell(git status:*)` does not
 *   answer `git status && curl … | sh`, nor anything with a substitution or a redirection — even
 *   inside quotes, because there is no parser here, and without one the only safe mistake is
 *   asking once more. An `allow` **exact** still covers the identical line: that string is what
 *   somebody approved;
 * - a `deny` covers the line if it covers **any command inside it**, so `shell(rm:*)` refuses
 *   `ls && rm -rf build` and `echo $(rm -rf x)`. It is a speed bump, not a sandbox: an alias, a
 *   script or `xargs` still gets past it, and the screen says so.
 */
export function ruleMatches(
  pattern: RulePattern,
  tool: Pick<CanonicalTool, 'kind' | 'subject'>,
  decision: PermissionDecision,
  folder: string | null,
): boolean {
  if (pattern.kind !== tool.kind) {
    return false;
  }

  if (pattern.reach === 'tool') {
    return true;
  }

  const { subject } = tool;

  switch (pattern.kind) {
    case 'shell':
      return subject.command !== undefined && shellCovers(pattern, subject.command, decision);
    case 'web.fetch':
      return subject.url !== undefined && hostOf(subject.url) === pattern.content;
    case 'mcp':
      return mcpCovers(pattern, subject.server, subject.tool);
    default: {
      const path = subject.paths?.[0];

      return path !== undefined && pathMatcherCovers(pattern.content, path, folder);
    }
  }
}

function shellCovers(pattern: RulePattern, line: string, decision: PermissionDecision): boolean {
  const covers = (command: string): boolean =>
    pattern.reach === 'exact'
      ? command === pattern.content
      : coversPrefix(command, pattern.content);

  if (decision === 'deny') {
    return covers(line) || shellSegments(line).some(covers);
  }

  return pattern.reach === 'exact' ? covers(line) : !hasShellOperator(line) && covers(line);
}

function mcpCovers(
  pattern: RulePattern,
  server: string | undefined,
  tool: string | undefined,
): boolean {
  if (server === undefined || tool === undefined) {
    return false;
  }

  return pattern.reach === 'prefix'
    ? server === pattern.content
    : `${server}:${tool}` === pattern.content;
}

/** `value` is the prefix, or continues it at a token boundary. */
function coversPrefix(value: string, prefix: string): boolean {
  return value === prefix || value.startsWith(`${prefix} `);
}

/** The host of [url], lower case, or `null` when it is not a URL with a host a rule can name. */
export function hostOf(url: string): string | null {
  let host: string;

  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Not a URL: no host a rule could name, so only the whole kind covers it.
    return null;
  }

  return HOST.test(host) ? host : null;
}

/**
 * The narrowest pattern that covers one call, in [folder], or `null` when none can be written.
 *
 * Narrowest and not widest, deliberately. "Allow for this session" is a sentence about the thing
 * on screen, and a person who approves `rm -rf build/` has not said anything about `rm -rf src/`.
 *
 * - `shell` → `shell(<command>)`;
 * - a path kind → `<kind>(<path>)`, relative to the folder when inside it, absolute otherwise;
 * - `web.fetch` → `web.fetch(domain:<host>)`;
 * - `mcp` → `mcp(<server>:<tool>)`.
 *
 * `null` is the honest answer when the subject has nothing such, or when the pattern would read back
 * as something other than what was written — a `)`, a `*` in a path, a `:*` at the end. A rule that
 * parses differently from how it was built is the one kind of rule a permission system must never
 * store. In both cases the caller falls back to `once` rather than widening.
 */
export function patternForInvocation(
  tool: Pick<CanonicalTool, 'kind' | 'subject'>,
  folder: string | null,
): string | null {
  const pattern = exactCandidate(tool, folder);

  return pattern !== null && readRulePattern(pattern)?.reach === 'exact' ? pattern : null;
}

/** How one kind writes the exact matcher of a call's subject — `null` when it has none. */
type ExactMatcher = (subject: ToolSubject, folder: string | null) => string | null;

/** The path a call is about, as an exact matcher: relative to the folder when inside it. */
const exactPath: ExactMatcher = (subject, folder) => {
  const path = subject.paths?.[0];
  const located = path === undefined ? null : locatePath(path, folder);
  const written = located === null ? null : (located.relative ?? located.absolute);

  return written === null || hasGlob(written) ? null : written;
};

/** The exact matcher of each kind that has one. */
const EXACT: Partial<Record<RuleKind, ExactMatcher>> = {
  shell: (subject) => subject.command ?? null,
  'web.fetch': (subject) => {
    const host = subject.url === undefined ? null : hostOf(subject.url);

    return host === null ? null : `domain:${host}`;
  },
  mcp: ({ server, tool }) =>
    server === undefined || tool === undefined || tool === '*' ? null : `${server}:${tool}`,
  'file.read': exactPath,
  'file.edit': exactPath,
  'file.write': exactPath,
  'file.delete': exactPath,
  'file.move': exactPath,
  search: exactPath,
};

/** The exact pattern of a call, before it is checked to read back as one. */
function exactCandidate(
  { kind, subject }: Pick<CanonicalTool, 'kind' | 'subject'>,
  folder: string | null,
): string | null {
  const matcher = isRuleKind(kind) ? EXACT[kind]?.(subject, folder) : null;

  return matcher === null || matcher === undefined ? null : `${kind}(${matcher})`;
}
