import type { CanonicalTool } from '@domain/engine';
import { isRuleKind, patternForInvocation } from './rule-pattern';
import { commandsOf } from './shell-syntax';

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
 * `shell(python:*)` is not "python", it is anything at all — the command is whatever comes after.
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

/** The prefix reach of a shell line: a pattern per command, or `null` when any command has none. */
function prefixReach(line: string | undefined): RuleReach | null {
  const commands = line === undefined ? null : commandsOf(line);
  const prefixes = commands?.map(commandPrefix) ?? [];

  if (prefixes.length === 0 || prefixes.some((prefix) => prefix === null)) {
    return null;
  }

  // No `)` can be in a prefix ({@link commandPrefix} refuses it), so each reads back as one.
  return {
    reach: 'prefix',
    patterns: [...new Set(prefixes.map((prefix) => `shell(${String(prefix)}:*)`))],
  };
}

/**
 * How far a rule left by answering this call may reach — computed here, never by a client, in the
 * canonical grammar (plan 28, B-31):
 *
 * - `exact`: this very subject — `shell(<command>)`, `file.edit(<path>)` (relative to [folder] when
 *   inside it), `search(<path>)`, `web.fetch(domain:<host>)`, `mcp(<server>:<tool>)`;
 * - `prefix` (shell only): every command that starts like each command of this line;
 * - `tool` (never shell): every call of the kind. A whole shell is Permitir tudo by another name,
 *   and that is a mode, not a rule.
 *
 * A kind no rule can name — a question, a plan, `other` — has no reach at all: it always asks.
 * A pure rule: what the card offers, and what an answer is checked against, are the same call.
 */
export function reachesFor(
  tool: Pick<CanonicalTool, 'kind' | 'subject'>,
  folder: string | null,
): readonly RuleReach[] {
  if (!isRuleKind(tool.kind)) {
    return [];
  }

  const reaches: RuleReach[] = [];
  const exact = patternForInvocation(tool, folder);

  if (exact !== null) {
    reaches.push({ reach: 'exact', patterns: [exact] });
  }

  if (tool.kind === 'shell') {
    const prefix = prefixReach(tool.subject.command);

    if (prefix !== null) {
      reaches.push(prefix);
    }
  } else {
    reaches.push({ reach: 'tool', patterns: [toolReachOf(tool)] });
  }

  return reaches;
}

/**
 * The pattern of "the tool, whatever its input": the bare kind — but, for `mcp`, the server's tools
 * (`mcp(<server>:*)`). A person who answers "always, for this tool" to one MCP tool has said nothing
 * about every other server; the bare `mcp` would answer them all.
 */
function toolReachOf(tool: Pick<CanonicalTool, 'kind' | 'subject'>): string {
  const server = tool.subject.server;
  return tool.kind === 'mcp' && server !== undefined && server !== '' && !server.includes(')')
    ? `mcp(${server}:*)`
    : tool.kind;
}
