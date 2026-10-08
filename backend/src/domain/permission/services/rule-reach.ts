import { matchedInput, patternForInvocation, readRulePattern } from './rule-pattern';
import type { RulePatternKind } from './rule-pattern';
import { commandsOf, SHELL_TOOLS } from './shell-syntax';

/** How far a rule left by an answer reaches. */
export const RULE_REACHES = ['exact', 'prefix', 'tool'] as const;

export type RuleReachKind = (typeof RULE_REACHES)[number];

/** One reach an answer may choose, with the rules it would leave — one per pattern. */
export interface RuleReach {
  readonly reach: RuleReachKind;
  readonly patterns: readonly string[];
}

/** Whether a string names a reach this build knows. */
export function isRuleReach(value: string): value is RuleReachKind {
  return (RULE_REACHES as readonly string[]).includes(value);
}

/**
 * Commands that never become a prefix: interpreters, launchers and elevation.
 *
 * `Bash(python:*)` is not "python", it is anything at all — the command is whatever comes after.
 * The list is the one of [15 · D-09](../../../../../docs/plans/15-rules-management/decisions.md),
 * kept here so that plan reads it rather than writing a second one.
 */
export const UNBOUNDED_COMMANDS: ReadonlySet<string> = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'env',
  'sudo',
  'su',
  'doas',
  'xargs',
  'eval',
  'exec',
  'source',
  '.',
  'nohup',
  'time',
  'timeout',
  'nice',
  'node',
  'deno',
  'bun',
  'perl',
  'ruby',
  'php',
  'npx',
  'pnpx',
  'bunx',
  'pnpm dlx',
  'npm exec',
  'yarn dlx',
]);

/** `python`, `python3`, `python3.12`: every name an interpreter of that family answers to. */
const PYTHON = /^python[0-9.]*$/;

/** A second token that reads as a subcommand — `push`, `test`, `run:dev` — and not as an argument. */
const SUBCOMMAND = /^[a-z][a-z0-9_:-]*$/;

/** What a token of a prefix may not carry: quoting, expansion, escaping, or the pattern's own `)`. */
const UNSAFE_IN_PREFIX = /["'`$\\()=]/;

function unbounded(prefix: string): boolean {
  const first = prefix.split(' ')[0] ?? '';

  return UNBOUNDED_COMMANDS.has(prefix) || UNBOUNDED_COMMANDS.has(first) || PYTHON.test(first);
}

/**
 * The prefix a command is covered by: its first token, plus the second when it is a subcommand —
 * `git push`, `pnpm test`, but `ls` for `ls -la` and `cat` for `cat file.txt`
 * ([23 · D-08](../../../../../docs/plans/23-fluid-permissions/decisions.md)).
 *
 * `null` when no prefix can be offered: an interpreter or a launcher (the prefix would be every
 * command), an environment assignment (`FOO=1 pnpm test` — the first token is not the command), or
 * a token a pattern cannot carry as it is.
 */
export function commandPrefix(command: string): string | null {
  const [first, second] = command.trim().split(/\s+/);

  if (first === undefined || first.length === 0 || UNSAFE_IN_PREFIX.test(first)) {
    return null;
  }

  const prefix = second !== undefined && SUBCOMMAND.test(second) ? `${first} ${second}` : first;

  return unbounded(prefix) ? null : prefix;
}

/** Whether a pattern reads back as the kind it was built to be — the one rule a reach may not break. */
function readsBackAs(pattern: string, kind: RulePatternKind): boolean {
  // `null` is not a pattern at all — a tool name outside the grammar: the reach is not offered.
  return readRulePattern(pattern)?.kind === kind;
}

/** The prefix reach of a shell line: a pattern per command, or `null` when any command has none. */
function prefixReach(toolName: string, input: Readonly<Record<string, unknown>>): RuleReach | null {
  const line = matchedInput(input);
  const commands = line === null ? null : commandsOf(line);
  const prefixes = commands?.map(commandPrefix) ?? [];

  if (prefixes.length === 0 || prefixes.some((prefix) => prefix === null)) {
    return null;
  }

  const patterns = [...new Set(prefixes.map((prefix) => `${toolName}(${String(prefix)}:*)`))];

  return patterns.every((pattern) => readsBackAs(pattern, 'prefix'))
    ? { reach: 'prefix', patterns }
    : null;
}

/**
 * How far a rule left by answering this invocation may reach — computed here, never by a client.
 *
 * - `exact`: this very input, the pattern of before;
 * - `prefix` (shell only): every command that starts like each command of this line;
 * - `tool` (never shell): every invocation of the tool. A whole shell is Permitir tudo by another
 *   name, and that is a mode, not a rule.
 *
 * A pure rule: what the card offers, and what an answer is checked against, are the same call.
 */
export function reachesFor(
  toolName: string,
  input: Readonly<Record<string, unknown>>,
): readonly RuleReach[] {
  const reaches: RuleReach[] = [];
  const exact = patternForInvocation(toolName, input);

  if (exact !== null && readsBackAs(exact, 'exact')) {
    reaches.push({ reach: 'exact', patterns: [exact] });
  }

  if (SHELL_TOOLS.has(toolName)) {
    const prefix = prefixReach(toolName, input);

    if (prefix !== null) {
      reaches.push(prefix);
    }
  } else if (readsBackAs(toolName, 'tool')) {
    reaches.push({ reach: 'tool', patterns: [toolName] });
  }

  return reaches;
}
