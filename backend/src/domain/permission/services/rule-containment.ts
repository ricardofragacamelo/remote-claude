import type { RulePattern } from './rule-pattern';
import { globCovers } from './rule-path';

/** A pattern, with the engine it is restricted to — `null` for a canonical one. */
export interface ReachableRule {
  readonly engine: string | null;
  readonly pattern: RulePattern;
}

/**
 * Whether everything [b] matches, [a] also matches — the containment the redundancy analysis
 * (plan 15, B-15) needs to tell a rule that adds nothing from one that does.
 *
 * `tool ⊇ prefix/glob ⊇ exact`, never across kinds, and a prefix contains another only at a token
 * boundary. A rule restricted to an engine never covers one of another engine; a canonical rule
 * (`engine: null`) reaches every engine's calls of its `kind`, so it covers both.
 */
export function patternCovers(a: ReachableRule, b: ReachableRule): boolean {
  if (!(a.engine === null || a.engine === b.engine)) {
    return false;
  }

  if (a.pattern.kind !== b.pattern.kind) {
    return false;
  }

  return patternReachCovers(a.pattern, b.pattern);
}

function patternReachCovers(a: RulePattern, b: RulePattern): boolean {
  if (a.reach === 'tool') {
    return true;
  }

  if (b.reach === 'tool') {
    // `a` is narrower than the whole kind; the whole kind is not covered by any one pattern of it.
    return false;
  }

  if (a.reach === 'exact') {
    return b.reach === 'exact' && a.content === b.content;
  }

  if (a.reach === 'glob') {
    // Only a path kind ever reads as `glob`, and `b` is the same kind, so `b.reach` here is
    // `exact` — `b`'s matcher, read as a literal string, is exactly the one concrete path a glob
    // widens into, and testing it against `a`'s glob is a sound proof of containment.
    return globCovers(a.content, b.content);
  }

  // `a.reach === 'prefix'`: a shell command line or an MCP server, at its own boundary.
  // `mcp`'s exact matcher joins server and tool with `:`; every other kind that can have a
  // `prefix` (`shell`) joins its tokens with a space.
  const boundary = a.kind === 'mcp' ? ':' : ' ';

  return a.content === b.content || b.content.startsWith(`${a.content}${boundary}`);
}
