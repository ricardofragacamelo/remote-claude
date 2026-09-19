import { PermissionRulePatternInvalidError } from '../errors/permission-rule-pattern-invalid.error';

/** What a pattern covers: the whole tool, one exact input, or everything under a prefix. */
export type RulePatternKind = 'tool' | 'exact' | 'prefix';

/** A pattern, once it has been read. */
export interface RulePattern {
  readonly toolName: string;
  readonly kind: RulePatternKind;

  /** The part inside the parentheses, without the `:*` of a prefix. Empty for a whole tool. */
  readonly content: string;
}

/** `Tool` or `Tool(...)`, with the tool name being an identifier and nothing else. */
const PATTERN = /^([A-Za-z][A-Za-z0-9_]*)(?:\((.*)\))?$/s;

/**
 * The fields a tool's input is matched on, in the order they are looked for.
 *
 * One field per invocation and never the whole object: a rule has to mean something a person can
 * read off a screen, and `Bash(git status)` does while a JSON blob does not.
 */
const MATCHED_FIELDS = ['command', 'file_path', 'path', 'pattern', 'url'] as const;

/**
 * Reads a pattern in the grammar of the Claude Code settings.
 *
 * | Pattern | Covers |
 * |---|---|
 * | `Bash` | every invocation of the tool |
 * | `Bash(git status)` | `git status`, and nothing else |
 * | `Bash(git status:*)` | `git status` and anything that continues it at a token boundary |
 *
 * No glob and no regular expression, and the reason is not restraint for its own sake: the stored
 * pattern is **literally** what goes back to the SDK in `updatedPermissions`. A grammar of our own
 * would need translating, and a translation that is one character out makes our half authorise a
 * set of commands the Claude half does not — or the other way round, which is worse
 * (docs/architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude).
 *
 * @throws {PermissionRulePatternInvalidError} for anything outside the three forms
 */
export function parseRulePattern(pattern: string): RulePattern {
  const match = PATTERN.exec(pattern.trim());
  const toolName = match?.[1];

  if (match === null || toolName === undefined) {
    throw new PermissionRulePatternInvalidError(pattern);
  }

  const inner = match[2];

  if (inner === undefined) {
    return { toolName, kind: 'tool', content: '' };
  }

  if (inner.length === 0) {
    // `Bash()` is not "every Bash": it is a pattern somebody meant to fill in. Reading it as the
    // widest possible rule is exactly the mistake a permission system may not make.
    throw new PermissionRulePatternInvalidError(pattern);
  }

  if (inner.endsWith(':*')) {
    const prefix = inner.slice(0, -2);

    if (prefix.length === 0) {
      throw new PermissionRulePatternInvalidError(pattern);
    }

    return { toolName, kind: 'prefix', content: prefix };
  }

  return { toolName, kind: 'exact', content: inner };
}

/**
 * The part of an input a pattern is matched against, or `null` when there is none.
 *
 * A tool whose input carries none of the known fields can only ever be covered by a whole-tool
 * pattern. That is the conservative reading: an unrecognised shape matches less, never more.
 */
export function matchedInput(input: Readonly<Record<string, unknown>>): string | null {
  for (const field of MATCHED_FIELDS) {
    const value = input[field];

    if (typeof value === 'string') {
      return value;
    }
  }

  return null;
}

/**
 * Whether a pattern covers an invocation.
 *
 * A pure rule and no I/O, which is what lets it be tested by boundary — and it is also where the
 * UI gets the sentence it shows about a rule's reach.
 *
 * **The prefix respects token boundaries.** `Bash(git status:*)` covers `git status --short` and
 * does **not** cover `git statusx`. Written with a bare `startsWith` it would cover both, and that
 * is the hole nobody notices until something is named just so.
 */
export function ruleMatches(
  pattern: RulePattern,
  toolName: string,
  input: Readonly<Record<string, unknown>>,
): boolean {
  if (pattern.toolName !== toolName) {
    return false;
  }

  if (pattern.kind === 'tool') {
    return true;
  }

  const value = matchedInput(input);
  if (value === null) {
    return false;
  }

  if (pattern.kind === 'exact') {
    return value === pattern.content;
  }

  return value === pattern.content || value.startsWith(`${pattern.content} `);
}

/**
 * The narrowest pattern that covers one invocation, or `null` when none can be written.
 *
 * Narrowest and not widest, deliberately. "Allow for this session" is a sentence about the thing
 * on screen, and a person who approves `rm -rf build/` has not said anything about `rm -rf src/`.
 *
 * `null` is the honest answer in two cases, and in both of them the caller falls back to `once`
 * rather than widening:
 *
 * - the input carries no matchable field, so the only pattern available would be the **whole
 *   tool** — which is far more than what was approved;
 * - the value contains a `)`, so the pattern would read back as something other than what was
 *   written. A rule that parses differently from how it was built is the one kind of rule a
 *   permission system must never store.
 */
export function patternForInvocation(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
): string | null {
  const value = matchedInput(input);

  return value === null || value.includes(')') ? null : `${toolName}(${value})`;
}
