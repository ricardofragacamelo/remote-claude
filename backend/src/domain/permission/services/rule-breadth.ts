import type { PermissionRuleBreadth } from '../errors/permission-rule-too-broad.error';
import { namesInterpreterOrLauncher } from './rule-reach';
import type { RulePattern } from './rule-pattern';
import { hasShellOperator } from './shell-syntax';

/**
 * How far a pattern reaches, on its own — `narrow`, `broad` or `unbounded`
 * ([15 · D-09](../../../../../docs/plans/15-rules-management/decisions.md)).
 *
 * Pure over the pattern: it says nothing about `allow` or `deny`, which is why a `deny` of any
 * width is always welcome — the use case that grants a rule decides what to do with the answer,
 * never this function.
 *
 * - `shell` whole, or a prefix with an operator, or starting with an interpreter, launcher or
 *   elevation → `unbounded`;
 * - any other kind whole (`file.edit`, `web.fetch`, `agent`…), a path glob, `mcp(server:tool)`,
 *   `mcp(server:*)`, or a `shell` prefix of one token → `broad`;
 * - everything exact, and a `shell` prefix of two tokens or more → `narrow`.
 */
export function ruleBreadth(pattern: RulePattern): PermissionRuleBreadth {
  if (pattern.kind === 'mcp') {
    // The input of MCP has no field a rule can match on: a server's tools, or one of them, are
    // the only patterns there are, and "every server" is the one way left to reach too far.
    return pattern.reach === 'tool' ? 'unbounded' : 'broad';
  }

  if (pattern.kind === 'shell') {
    return shellBreadth(pattern.reach, pattern.content);
  }

  // Every other kind: a glob or the bare kind reaches more than one call, an exact path or host
  // reaches one.
  return pattern.reach === 'exact' ? 'narrow' : 'broad';
}

function shellBreadth(reach: RulePattern['reach'], content: string): PermissionRuleBreadth {
  if (reach === 'tool') {
    return 'unbounded';
  }

  if (reach === 'exact') {
    return 'narrow';
  }

  // A prefix that already carries an operator is not "this command, however it continues" — it
  // is a second command tucked inside the one a person thought they were naming.
  if (hasShellOperator(content)) {
    return 'unbounded';
  }

  const tokens = content.trim().split(/\s+/);

  return startsWithInterpreter(tokens) ? 'unbounded' : tokens.length === 1 ? 'broad' : 'narrow';
}

/** Whether the first token, or the first two read together, name an interpreter or launcher. */
function startsWithInterpreter(tokens: readonly string[]): boolean {
  const [first, second] = tokens;

  if (first === undefined) {
    return false;
  }

  return (
    namesInterpreterOrLauncher(first) ||
    (second !== undefined && namesInterpreterOrLauncher(`${first} ${second}`))
  );
}
