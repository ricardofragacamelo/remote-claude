import { analyzeRules, describeReach, parseRulePattern, ruleBreadth } from '@domain/permission';
import type {
  PermissionDecision,
  PermissionRuleBreadth,
  PermissionRuleScope,
  RuleFinding,
  RuleReachDescription,
} from '@domain/permission';
import type { UserId } from '@domain/auth';
import { toAnalyzable } from './rule-analysis-adapter';
import {
  EMPTY_PERMISSION_RULE_FILTER,
  type PermissionRuleRepository,
} from './ports/permission-rule.repository';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';

/** A pattern nobody has granted yet — seeing its reach and what it would mean before creating it. */
export interface PermissionRuleDraftInput {
  readonly userId: UserId;

  /** In the canonical grammar. Outside it: `PermissionRulePatternInvalidError`. */
  readonly pattern: string;
  readonly engine?: string | null;
  readonly decision: PermissionDecision;
  readonly scope: PermissionRuleScope;

  /**
   * Required for `project`, ignored for `always`/`session` — a raw path, resolved against the
   * allowlist the same way `POST /permission-rules` does ([15 · D-10]).
   */
  readonly projectPath?: string | null;
}

/** What previewing a draft answers — the contract's shape, verbatim ([15 · B-03, F0]). */
export interface PermissionRulePreview {
  readonly pattern: string;
  readonly reach: RuleReachDescription;
  readonly breadth: PermissionRuleBreadth;
  readonly findings: readonly RuleFinding[];
}

/**
 * "What would this rule reach, and does it conflict with what I already have?" — before a single
 * byte is written (plan 15, B-15).
 *
 * No breadth is ever refused here: the point of a preview is to see `unbounded`/`broad` **before**
 * deciding to acknowledge it, which `POST /permission-rules` still enforces. A folder is resolved
 * the same way creation does, so a `project` draft for a folder outside the allowlist fails exactly
 * where creating it would.
 */
export class PreviewPermissionRuleUseCase {
  constructor(
    private readonly rules: PermissionRuleRepository,
    private readonly folders: RuleFolderResolver,
  ) {}

  /**
   * @throws {import('@domain/permission').PermissionRulePatternInvalidError} outside the grammar
   * @throws whatever `RuleFolderResolver` refuses a raw `projectPath` with
   */
  async execute(draft: PermissionRuleDraftInput): Promise<PermissionRulePreview> {
    const pattern = parseRulePattern(draft.pattern);
    const projectPath =
      draft.scope === 'project' && draft.projectPath != null
        ? (await this.folders.resolve(draft.projectPath, draft.userId)).value
        : null;

    const breadth = ruleBreadth(pattern);
    const active = await this.rules.listAllMatching(draft.userId, {
      ...EMPTY_PERMISSION_RULE_FILTER,
      status: ['active'],
    });

    const draftId = '';
    const analyzable = [
      ...active.map((rule) => toAnalyzable(rule, this.folders, draft.userId)),
      {
        id: draftId,
        engine: draft.engine ?? null,
        pattern,
        ruleContent: draft.pattern,
        decision: draft.decision,
        scope: draft.scope,
        projectPath,
        breadth,
        folderReachable: null,
      },
    ];

    return {
      pattern: draft.pattern,
      reach: describeReach(pattern, draft.decision, draft.engine ?? null),
      breadth,
      findings: analyzeRules(analyzable).get(draftId) ?? [],
    };
  }
}
