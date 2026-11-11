import type {
  PermissionRule as ContractPermissionRule,
  PermissionRuleBatchPayload,
  PermissionRuleEvaluationPayload,
  PermissionRuleExportPayload,
  PermissionRuleHistoryPayload,
  PermissionRuleImportPreviewPayload,
  PermissionRuleImportResultPayload,
  PermissionRulePreviewPayload,
  PermissionRuleSimulationPayload,
  PermissionRuleSummaryPayload,
  PermissionRuleTemplatesPayload,
} from '@remote-claude/contracts';

import type { PermissionDecision, PersistedScope } from './permission';

/**
 * Whether a rule still answers.
 *
 * Computed by the server at the moment it answers, never here: the list shows an expired rule
 * marked rather than missing, and that cannot depend on the clock of whatever device is looking.
 * A revoked rule is not listed at all — "gone" and "no longer valid" are different things to
 * somebody looking for what they authorised — but it still opens by id, from the trail entry it
 * answered, and then it says it was revoked
 * ([D-18](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export type RuleStatus = ContractPermissionRule['status'];

/**
 * Why a rule stopped answering on its own: it was written for an agent in a form this version cannot
 * carry over to the canonical grammar, so it was kept, disabled, for the person to see and create
 * again (plan 28, D-18). `reason` is a code (`untranslatable`), never a sentence.
 */
export type RuleDisabled = NonNullable<ContractPermissionRule['disabled']>;

/**
 * Something the user authorised in advance, as the rules screen knows it (`GET /permission-rules`
 * and friends).
 *
 * `always` means, in practice, "don't ask me again" — which is why every field that says how far
 * it reaches is here, and why none of them is optional.
 *
 * Narrower than the contract's `PermissionRule` on two fields: `scope` is only ever `project` or
 * `always` here — the one reachable from these routes, `session` living in memory only and never
 * persisted or listed (plan 28, B-48) — and `toolName` is left out entirely: kept by the server for
 * the published app, but this screen names a rule by its `kind`, never by the engine's own word.
 */
export type PermissionRule = Omit<ContractPermissionRule, 'scope' | 'toolName'> & {
  readonly scope: PersistedScope;
};

/** A rule on screen: the rule, and whether it is about to stop answering. */
export interface ListedRule {
  readonly rule: PermissionRule;

  /**
   * Fewer than seven days left. Without the warning, a session starts asking again with no
   * explanation — the convenience is lost and the loss is not explained
   * ([D-13](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
   */
  readonly expiringSoon: boolean;
}

/**
 * What a row says when revoking it failed: the key and its parameters, and nothing of the
 * transport. An `AppError` fits it; the component never has to know that type exists.
 */
export interface RowFailure {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** The field the listing sorts by — the backend's own set, nothing added here (plan 15, B-10). */
export type RuleSort = 'grantedAt' | 'expiresAt' | 'lastUsedAt' | 'useCount' | 'pattern';
export type RuleOrder = 'asc' | 'desc';

/**
 * Every filter the listing, the summary and the export share — in the URL's search, so a filtered
 * list is a link (plan 15, B-20).
 *
 * `status` is plural: more than one tab's worth at once is what "Perto de expirar" needs — it is
 * `active`, narrowed further on the client by `expiresAt` (plan 03, D-13), never its own server
 * status.
 */
export interface RuleFilters {
  readonly status?: readonly RuleStatus[];
  readonly scope?: PersistedScope;
  readonly decision?: PermissionDecision;
  readonly engine?: string;
  readonly kind?: string;
  readonly folder?: string;
  readonly q?: string;
  readonly expiresBefore?: string;
}

/** `RuleFilters`, plus how the listing orders what it reads — the export and the summary take only the filters. */
export interface RuleListQuery extends RuleFilters {
  readonly sort?: RuleSort;
  readonly order?: RuleOrder;
}

/** One page of the listing. */
export interface RulePage {
  readonly rules: readonly PermissionRule[];
  readonly nextCursor: string | null;
}

/** The field names `PermissionRuleSummaryPayload` counts — re-exported so a hook never imports the wire type. */
export type RuleSummary = PermissionRuleSummaryPayload;

/** `POST /permission-rules`: what creating a rule by hand sends. */
export interface GrantRuleInput {
  readonly pattern: string;
  readonly engine?: string;
  readonly decision: PermissionDecision;
  readonly scope: PersistedScope;
  readonly projectPath?: string;
  readonly expiresAt?: string;
  readonly acknowledgeBroad?: boolean;
  readonly templateId?: string;
}

/** `PATCH /permission-rules/:ruleId`: encurtar or estender — the new validity, `If-Match`'d. */
export interface ChangeRuleExpiryInput {
  readonly ruleId: string;
  readonly etag: string;
  readonly expiresAt: string;
}

export type RuleBatch = PermissionRuleBatchPayload;
export type RuleHistory = PermissionRuleHistoryPayload;
export type RuleEvaluation = PermissionRuleEvaluationPayload;
export type RulePreview = PermissionRulePreviewPayload;
export type RuleSimulation = PermissionRuleSimulationPayload;
export type RuleTemplates = PermissionRuleTemplatesPayload;
export type RuleExport = PermissionRuleExportPayload;
export type RuleImportPreview = PermissionRuleImportPreviewPayload;
export type RuleImportResult = PermissionRuleImportResultPayload;

/** `POST /permission-rules/evaluate`: testing a command, the engine, its canonical `kind` and subject (B-14). */
export interface EvaluateRuleInput {
  readonly engine?: string;
  readonly kind: string;
  readonly subject: Readonly<Record<string, unknown>>;
  readonly folder?: string;
  readonly mode?: string;

  /** A live session of the caller's own — its `session`-scoped rules and current mode count too (D-12). */
  readonly sessionId?: string;

  /** Inside the wizard, the rule being authored counts as if it already existed (S-198, D-12). */
  readonly draft?: {
    readonly pattern: string;
    readonly decision: PermissionDecision;
    readonly engine?: string;
  };
}

/** `POST /permission-rules/preview`: a pattern nobody has granted yet (plan 15, B-15). */
export interface PreviewRuleInput {
  readonly pattern: string;
  readonly engine?: string;
  readonly decision: PermissionDecision;
  readonly scope: PersistedScope;
  readonly projectPath?: string;
}

/** `POST /permission-rules/simulate`: a lot of drafts and removals, weighed (plan 15, B-16). */
export interface SimulateRulesInput {
  readonly add?: readonly { pattern: string; decision: PermissionDecision; engine?: string }[];
  readonly remove?: readonly string[];
  readonly folder?: string;
  readonly limit?: number;
}

/** `POST /permission-rules/import`: the file the preview read, its digest, and what was accepted (B-18). */
export interface ApplyRuleImportInput {
  readonly file: string;
  readonly digest: string;
  readonly accept: readonly number[];
  readonly acknowledgeBroad?: readonly number[];
  readonly folderMap?: Readonly<Record<string, string>>;
  readonly expiresAt?: string;
}
