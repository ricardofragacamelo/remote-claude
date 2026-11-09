import type { PermissionRule as Rule, RuleQuestion } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { AuditTrailReader, AuditTrailRecord, DecidedInvocation } from '@application/audit';
import { ToolClassifiers } from '@application/engine';
import type { Clock } from '@domain/shared';
import { decideOutcome } from './decide-outcome';
import type { RuleDraft } from './draft-permission-rule';
import { draftPermissionRule } from './draft-permission-rule';
import { ownedRule } from './owned-rule';
import {
  EMPTY_PERMISSION_RULE_FILTER,
  type PermissionRuleRepository,
} from './ports/permission-rule.repository';

/** A pattern weighed as part of the simulation — not stored, like `EvaluationDraft`. */
export type SimulationDraft = RuleDraft;

export interface SimulatePermissionRulesCommand {
  readonly userId: UserId;
  /** Up to 10 — the lot this call is weighed with, never stored. */
  readonly add?: readonly SimulationDraft[];
  /** Up to 100 rule ids, as if revoked — checked for ownership before anything is read. */
  readonly remove?: readonly string[];
  /** The folder `add`'s drafts are scoped to — `project` there, or `always` when absent. */
  readonly folder?: string | null;
  /** Default 200, ceiling 1000 ([15 · D-15]). */
  readonly limit?: number;
}

export type SimulationCountKey = 'unchanged' | 'wouldAutoAllow' | 'wouldAutoDeny' | 'wouldAsk';

/** What one invocation would become, only when it changes — the trail shows the rest unmoved. */
export interface SimulationChange {
  readonly before: 'allow' | 'deny';
  readonly after: 'allow' | 'deny' | 'ask';
  /** The entry's own record — `seq` and `traceId` included, so the DTO can disclose it like any other (S-132). */
  readonly record: AuditTrailRecord;
  readonly answeringRule: Rule | null;
}

export interface PermissionSimulation {
  readonly counts: Readonly<Record<SimulationCountKey, number>>;
  readonly changes: readonly SimulationChange[];
  /** Invocations with no folder on record — too old for `session_origins` (S-125). */
  readonly withoutFolder: number;
  readonly assumedMode: 'ask';
}

export const SIMULATE_DEFAULT_LIMIT = 200;
export const SIMULATE_MAX_LIMIT = 1000;
const MAX_ADD = 10;
const MAX_REMOVE = 100;
const MAX_CHANGES = 100;

/**
 * "If I added or removed these, what would have been different in my last N invocations?" — read
 * only, nothing stored, nothing announced (plan 15, B-16, D-15).
 *
 * The comparison is honest about two limits of its own: the mode is never in the trail, so every
 * invocation is read under the canonical `ask` ({@link PermissionSimulation.assumedMode}); and only
 * the entries that reached `canUseTool` are read — the ones the CLI answered by itself, `recorded`
 * with no verdict, were never a rule's to answer, and no rule here would have either.
 */
export class SimulatePermissionRulesUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly trail: AuditTrailReader,
    private readonly classifiers: ToolClassifiers,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRuleNotFoundError} a `remove` id that is nobody's
   * @throws {import('@domain/permission').PermissionRuleNotOwnedError} a `remove` id of somebody else's
   * @throws {import('@domain/permission').PermissionRulePatternInvalidError} an `add` outside the grammar
   */
  async execute(command: SimulatePermissionRulesCommand): Promise<PermissionSimulation> {
    const limit = Math.min(command.limit ?? SIMULATE_DEFAULT_LIMIT, SIMULATE_MAX_LIMIT);
    const remove = (command.remove ?? []).slice(0, MAX_REMOVE);

    for (const ruleId of remove) {
      await ownedRule(this.rules, command.userId, ruleId);
    }

    const after = await this.after(command, new Set(remove));
    const invocations = await this.trail.decided(command.userId, limit);

    return this.compared(invocations, after);
  }

  /** The rules the simulation answers against: active, minus removed, plus the added drafts. */
  private async after(
    command: SimulatePermissionRulesCommand,
    removed: ReadonlySet<string>,
  ): Promise<readonly Rule[]> {
    const now = this.clock.now();
    const active = await this.rules.listAllMatching(command.userId, {
      ...EMPTY_PERMISSION_RULE_FILTER,
      status: ['active'],
    });
    const drafted = (command.add ?? [])
      .slice(0, MAX_ADD)
      .map((draft) => draftPermissionRule(draft, command.userId, command.folder ?? null, now));

    return [...active.filter((rule) => !removed.has(rule.id)), ...drafted];
  }

  /** Every invocation, against what it was and what `after` would now answer. */
  private compared(
    invocations: readonly DecidedInvocation[],
    after: readonly Rule[],
  ): PermissionSimulation {
    const counts: Record<SimulationCountKey, number> = {
      unchanged: 0,
      wouldAutoAllow: 0,
      wouldAutoDeny: 0,
      wouldAsk: 0,
    };
    const changes: SimulationChange[] = [];
    let withoutFolder = 0;

    for (const invocation of invocations) {
      if (invocation.folder === null) {
        withoutFolder += 1;
      }

      const before: 'allow' | 'deny' =
        invocation.record.entry.decision === 'denied' ? 'deny' : 'allow';
      const { outcome, answeringRule } = decideOutcome(
        after,
        questionOf(invocation, this.classifiers),
        'ask',
      );

      if (outcome === before) {
        counts.unchanged += 1;
        continue;
      }

      counts[countKeyOf(outcome)] += 1;

      if (changes.length < MAX_CHANGES) {
        changes.push({ before, after: outcome, record: invocation.record, answeringRule });
      }
    }

    return { counts, changes, withoutFolder, assumedMode: 'ask' };
  }
}

/** Which count bucket a new outcome falls in — the old one was never this, or it would be unchanged. */
function countKeyOf(outcome: 'allow' | 'deny' | 'ask'): SimulationCountKey {
  if (outcome === 'allow') {
    return 'wouldAutoAllow';
  }

  return outcome === 'deny' ? 'wouldAutoDeny' : 'wouldAsk';
}

/** The question a stored decision entry asks, again — the same read `QueryAuditTrailUseCase` does. */
function questionOf(invocation: DecidedInvocation, classifiers: ToolClassifiers): RuleQuestion {
  const { entry } = invocation.record;
  const tool = classifiers.classify(
    null,
    entry.toolName,
    entry.input.value,
    invocation.folder ?? '',
  );

  return {
    subject: { userId: entry.userId, sessionId: entry.sessionId, projectPath: invocation.folder },
    tool: { kind: tool.kind, subject: tool.subject, origin: tool.origin },
    permissionMode: 'ask',
    now: entry.at,
  };
}
