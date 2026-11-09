import type { PermissionRuleScope } from '../entities/permission-rule.entity';
import type { PermissionDecision } from '../entities/permission-request.entity';
import type { PermissionRuleBreadth } from '../errors/permission-rule-too-broad.error';
import { projectPathReaches } from './project-reach';
import { patternCovers } from './rule-containment';
import type { ReachableRule } from './rule-containment';
import type { RulePattern } from './rule-pattern';

/** What the redundancy/overlap/conflict analysis can say about a rule (plan 15, B-15). */
export const RULE_FINDING_KINDS = [
  'identical',
  'redundant',
  'shadowedByDeny',
  'overlapsDeny',
  'tooBroad',
  'unreachable',
] as const;
export type RuleFindingKind = (typeof RULE_FINDING_KINDS)[number];

/** One thing the analysis says about a rule, against the caller's other active rules. */
export interface RuleFinding {
  readonly kind: RuleFindingKind;
  /** The other rules the finding is about — empty for a finding about the rule alone. */
  readonly ruleIds: readonly string[];
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * What the analysis needs to know about one rule — a subset of {@link PermissionRule}'s own fields,
 * so a draft that was never persisted (no id, no real {@link PermissionRule}) can be analysed the
 * same way as an active one: the caller gives it a synthetic id of its own.
 */
export interface AnalyzableRule {
  readonly id: string;
  readonly engine: string | null;
  /** `null` on a `disabled` rule — never analysed (it has no canonical pattern to compare). */
  readonly pattern: RulePattern | null;
  /** The pattern exactly as written, for `identical` — a string the domain never reparses. */
  readonly ruleContent: string;
  readonly decision: PermissionDecision;
  readonly scope: PermissionRuleScope;
  readonly projectPath: string | null;
  readonly breadth: PermissionRuleBreadth | null;
  /**
   * Whether a `project` rule's folder is still in the caller's allowlist — `null` for `always`,
   * where the question does not apply. Computed by the caller, which alone can ask the allowlist
   * ([15 · B-10]'s `folderReachable`); the domain only reads the answer.
   */
  readonly folderReachable: boolean | null;
}

/**
 * What each rule of [rules] finds about itself, against every other one — pure, over the canonical
 * grammar, in a deterministic order (plan 15, B-15, S-120).
 *
 * Three things never generate a finding against another rule: a `disabled` rule (no pattern to
 * compare), and a pair that is not **both** scope-related (`always` ⊇ any `project`, or one
 * `project` reaching the other's folder — [15 · D-10], revised 2026-11-05 to reach subfolders too)
 * **and** pattern-related (`patternCovers`, either direction) — two rules that never answer the same
 * call have nothing to say about each other.
 */
export function analyzeRules(
  rules: readonly AnalyzableRule[],
): ReadonlyMap<string, readonly RuleFinding[]> {
  const findings = new Map<string, RuleFinding[]>(rules.map((rule) => [rule.id, []]));

  for (const rule of rules) {
    if (rule.pattern === null) {
      continue;
    }

    // A `deny` is never too broad — blocking wide is never less safe (D-09) — so only an `allow`
    // past today's breadth rule is a finding here.
    if (rule.decision === 'allow' && rule.breadth !== null && rule.breadth !== 'narrow') {
      push(findings, rule.id, tooBroadFinding(rule.breadth));
    }

    if (rule.scope === 'project' && rule.folderReachable === false) {
      push(findings, rule.id, unreachableFinding());
    }
  }

  for (const [index, rule] of rules.entries()) {
    for (const other of rules.slice(index + 1)) {
      pairFindings(rule, other, findings);
    }
  }

  return new Map([...findings].map(([id, list]) => [id, sorted(list)]));
}

function pairFindings(
  a: AnalyzableRule,
  b: AnalyzableRule,
  findings: Map<string, RuleFinding[]>,
): void {
  if (a.pattern === null || b.pattern === null) {
    return;
  }

  // Related in **some** direction on each axis — never the same direction on both, which is
  // {@link fullyCovers}. A call both could ever both answer needs only this much: the pattern they
  // share does not have to be the same rule that also has the wider scope (B-15, S-112's partial
  // overlap — a `project` `deny` of the whole kind, beside an `always` `allow` of one exact call).
  const patternRelated = coversEitherWay(patternCovers, reachableOf(a), reachableOf(b));
  const scopeRelated = coversEitherWay(scopeCovers, a, b);

  if (!patternRelated || !scopeRelated) {
    return;
  }

  if (a.decision === b.decision) {
    sameDecisionFinding(a, b, findings);
    return;
  }

  const [deny, allow] = a.decision === 'deny' ? [a, b] : [b, a];

  push(
    findings,
    allow.id,
    fullyCovers(deny, allow) ? shadowedByDenyFinding(deny.id) : overlapsDenyFinding(deny.id),
  );
}

function sameDecisionFinding(
  a: AnalyzableRule,
  b: AnalyzableRule,
  findings: Map<string, RuleFinding[]>,
): void {
  if (isIdentical(a, b)) {
    push(findings, a.id, identicalFinding(b.id));
    push(findings, b.id, identicalFinding(a.id));
    return;
  }

  // One fully covers the other without being identical: the narrower one adds nothing (B-15,
  // S-111, S-113). Covering each other only partially, with the same decision, is not a finding
  // this analysis names — there is no "two allows overlap" kind, only a `deny` crossing an `allow`
  // is worth a warning.
  if (fullyCovers(a, b)) {
    push(findings, b.id, redundantFinding(a.id));
  } else if (fullyCovers(b, a)) {
    push(findings, a.id, redundantFinding(b.id));
  }
}

function isIdentical(a: AnalyzableRule, b: AnalyzableRule): boolean {
  return (
    a.engine === b.engine &&
    a.ruleContent === b.ruleContent &&
    a.decision === b.decision &&
    a.scope === b.scope &&
    a.projectPath === b.projectPath
  );
}

/** Whether [wide] fully covers [narrow]: its scope reaches it, and its pattern matches it too. */
function fullyCovers(wide: AnalyzableRule, narrow: AnalyzableRule): boolean {
  return scopeCovers(wide, narrow) && patternCovers(reachableOf(wide), reachableOf(narrow));
}

function coversEitherWay<T>(covers: (a: T, b: T) => boolean, a: T, b: T): boolean {
  return covers(a, b) || covers(b, a);
}

/** Whether [wide]'s scope reaches everywhere [narrow]'s does — `always`, or the same/parent folder. */
function scopeCovers(wide: AnalyzableRule, narrow: AnalyzableRule): boolean {
  if (wide.scope === 'always') {
    return true;
  }

  if (narrow.scope === 'always') {
    return false;
  }

  return (
    wide.projectPath !== null &&
    narrow.projectPath !== null &&
    projectPathReaches(wide.projectPath, narrow.projectPath)
  );
}

function reachableOf(rule: AnalyzableRule): ReachableRule {
  return { engine: rule.engine, pattern: rule.pattern as RulePattern };
}

/**
 * One constructor per kind, each with its `messageKey` written out — never built from a variable:
 * the i18n check only credits a key as "sent to the client" when it reads `messageKey: '…'` as a
 * literal (`scripts/lib/i18n.mjs`'s `emittedMessageKeys`), so a key assembled from `kind` at
 * runtime is one it cannot prove any catalogue has to carry.
 */
function identicalFinding(ruleId: string): RuleFinding {
  return {
    kind: 'identical',
    ruleIds: [ruleId],
    messageKey: 'permission.ruleFinding.identical',
    params: {},
  };
}

function redundantFinding(ruleId: string): RuleFinding {
  return {
    kind: 'redundant',
    ruleIds: [ruleId],
    messageKey: 'permission.ruleFinding.redundant',
    params: {},
  };
}

function shadowedByDenyFinding(ruleId: string): RuleFinding {
  return {
    kind: 'shadowedByDeny',
    ruleIds: [ruleId],
    messageKey: 'permission.ruleFinding.shadowedByDeny',
    params: {},
  };
}

function overlapsDenyFinding(ruleId: string): RuleFinding {
  return {
    kind: 'overlapsDeny',
    ruleIds: [ruleId],
    messageKey: 'permission.ruleFinding.overlapsDeny',
    params: {},
  };
}

function tooBroadFinding(breadth: PermissionRuleBreadth): RuleFinding {
  return {
    kind: 'tooBroad',
    ruleIds: [],
    messageKey: 'permission.ruleFinding.tooBroad',
    params: { breadth },
  };
}

function unreachableFinding(): RuleFinding {
  return {
    kind: 'unreachable',
    ruleIds: [],
    messageKey: 'permission.ruleFinding.unreachable',
    params: {},
  };
}

function push(findings: Map<string, RuleFinding[]>, id: string, finding: RuleFinding): void {
  findings.get(id)?.push(finding);
}

/** Deterministic order: by kind first (declaration order), then by the first related rule's id. */
function sorted(list: readonly RuleFinding[]): readonly RuleFinding[] {
  return [...list].sort((a, b) => {
    const byKind = RULE_FINDING_KINDS.indexOf(a.kind) - RULE_FINDING_KINDS.indexOf(b.kind);
    if (byKind !== 0) {
      return byKind;
    }

    return (a.ruleIds[0] ?? '').localeCompare(b.ruleIds[0] ?? '');
  });
}
