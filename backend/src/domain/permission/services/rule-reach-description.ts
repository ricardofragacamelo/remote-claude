import type { PermissionDecision } from '../entities/permission-request.entity';
import type { RuleKind, RulePattern } from './rule-pattern';

/** How a reach is shown: the whole `kind`, one exact subject, or everything under a pattern. */
export type RuleReachForm = 'any' | 'exact' | 'prefix';

/**
 * The alcance of a rule, structured for a client to phrase — never for a client to reinterpret the
 * pattern itself ([plano 03 · D-12](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export interface RuleReachDescription {
  /** The engine the rule is restricted to, or `null` for a canonical one. */
  readonly engine: string | null;
  readonly kind: RuleKind;
  readonly form: RuleReachForm;

  /** What is matched, without its syntax — the same `content` the pattern was read with. */
  readonly content: string;

  /**
   * Whether this reach, answering `allow`, leaves a composite shell line (one with an operator)
   * out of its reach ([15 · D-07](../../../../../docs/plans/15-rules-management/decisions.md)). A
   * `deny` of the same pattern does **not** exclude a composite line — it refuses it by segment —
   * so this is `false` there, and `false` for anything that is not a `shell` prefix.
   */
  readonly excludesCompound: boolean;
}

const FORM_OF: Record<RulePattern['reach'], RuleReachForm> = {
  tool: 'any',
  exact: 'exact',
  prefix: 'prefix',
  glob: 'prefix',
};

/**
 * Reads the structured reach of a pattern — the domain's own description, over the canonical
 * grammar, with nothing an engine's dialect would recognise.
 */
export function describeReach(
  pattern: RulePattern,
  decision: PermissionDecision,
  engine: string | null = null,
): RuleReachDescription {
  return {
    engine,
    kind: pattern.kind,
    form: FORM_OF[pattern.reach],
    content: pattern.content,
    excludesCompound:
      pattern.kind === 'shell' && pattern.reach === 'prefix' && decision === 'allow',
  };
}
