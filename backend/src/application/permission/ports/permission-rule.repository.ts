import type { UserId } from '@domain/auth';
import type {
  PermissionDecision,
  PermissionRule,
  PermissionRuleStatus,
  PersistedPermissionScope,
} from '@domain/permission';

/** The sort fields the listing offers (plan 15, B-10). */
export const PERMISSION_RULE_SORT_FIELDS = [
  'grantedAt',
  'expiresAt',
  'lastUsedAt',
  'useCount',
  'pattern',
] as const;
export type PermissionRuleSortField = (typeof PERMISSION_RULE_SORT_FIELDS)[number];
export type PermissionRuleSortOrder = 'asc' | 'desc';

/** What narrows a listing or a summary down — every field optional, an empty filter is everyone's. */
export interface PermissionRuleListFilter {
  /** Empty: the default — `active` and `expired`, never `revoked` nor `disabled` (S-01). */
  readonly status: readonly PermissionRuleStatus[];
  readonly scope: PersistedPermissionScope | null;
  readonly decision: PermissionDecision | null;
  readonly engine: string | null;
  /** The canonical kind — `shell`, `file.edit` — matched against the pattern's own kind. */
  readonly kind: string | null;
  readonly folder: string | null;
  /** Only rules (of `active` status) expiring strictly before this instant. */
  readonly expiresBefore: Date | null;
  /** Literal — never a wildcard (S-45). Matched against the pattern and the folder. */
  readonly q: string | null;
}

/** The empty filter — everyone's rules, the default status set. */
export const EMPTY_PERMISSION_RULE_FILTER: PermissionRuleListFilter = {
  status: [],
  scope: null,
  decision: null,
  engine: null,
  kind: null,
  folder: null,
  expiresBefore: null,
  q: null,
};

/**
 * Where a cursor page stopped: the sort key's own value at the last row kept, plus `(grantedAt,
 * id)` as the tiebreak ([15 · D-13](../../../../../docs/plans/15-rules-management/decisions.md#d-13--a-listagem-pagina)) —
 * what makes a page stable even when two rules share the sorted value to the millisecond.
 */
export interface PermissionRuleCursor {
  readonly sort: PermissionRuleSortField;
  readonly order: PermissionRuleSortOrder;
  readonly value: string | number | null;
  readonly grantedAt: string;
  readonly id: string;
}

export interface PermissionRuleListRequest {
  readonly userId: UserId;
  readonly filter: PermissionRuleListFilter;
  readonly sort: PermissionRuleSortField;
  readonly order: PermissionRuleSortOrder;
  readonly cursor: PermissionRuleCursor | null;
  readonly pageSize: number;
  readonly now: Date;
}

export interface PermissionRuleListPage {
  readonly items: readonly PermissionRule[];
  /** Opaque — encoded by {@link import('../permission-rule-cursor').encodeRuleCursor}. */
  readonly nextCursor: string | null;
}

/** Counts over the same predicate a listing would read — for the tabs and the navigation badge. */
export interface PermissionRuleSummary {
  readonly byStatus: Readonly<Record<PermissionRuleStatus, number>>;
  readonly byDecision: Readonly<Record<PermissionDecision, number>>;
  readonly byScope: Readonly<Record<PersistedPermissionScope, number>>;
  /** Active rules expiring before `filter.expiresBefore` — `0` when it is not given. */
  readonly expiringBefore: number;
}

/** What granting did: the rule that now stands, and whether this call is what made it. */
export interface RuleGrant {
  readonly rule: PermissionRule;

  /** `false` when an equivalent rule was already active, and that one came back instead. */
  readonly created: boolean;
}

/** What writing a revocation did: the rule as it is now stored, and whether this call revoked it. */
export interface RuleRevocation {
  /** The revocation the store keeps — this call's when it was first, the earlier one otherwise. */
  readonly rule: PermissionRule;

  /** `false` when another revocation got there first, and this one wrote nothing. */
  readonly revoked: boolean;
}

/** What writing a new validity did: the rule as it is now stored, and whether this call wrote it. */
export interface RuleExpiryChange {
  /** This call's new validity when it won the race, the rule exactly as it stands otherwise. */
  readonly rule: PermissionRule;

  /** `false` when the rule moved since the caller read it — revoked, or patched by another call. */
  readonly changed: boolean;
}

/**
 * The rules that outlive a session — `project` and `always` — in whatever stores them.
 *
 * A `session` rule never reaches this port: it lives in the registry and dies with the subprocess,
 * which is what a session rule means. What comes here is what has to survive the process.
 *
 * There is no `delete`. A revoked rule is written as revoked and kept, because the trail points at
 * it — "which rule let this run?" has to have an answer even after somebody took the rule back.
 */
export interface PermissionRuleRepository {
  /**
   * Stores the rule, unless an equivalent one is already active — then that one comes back.
   *
   * **Atomic**, and that is the point of it being one method rather than a find and a save: two
   * clients granting the same rule at the same moment must end up with one row, not two.
   */
  grant(rule: PermissionRule, now: Date): Promise<RuleGrant>;

  /** The rule with that id, whoever owns it and whatever its state, or `null`. */
  findById(ruleId: string): Promise<PermissionRule | null>;

  /**
   * The rules of this person that could answer a request right now: active, not revoked, and
   * either `always` or `project` for that workspace root.
   *
   * The pattern is **not** matched here. That is the domain's job, and a query that pre-filtered
   * by pattern would be a second, untested implementation of the matcher.
   */
  findApplicable(userId: UserId, projectPath: string | null, now: Date): Promise<PermissionRule[]>;

  /** This person's rules that have not been revoked, newest first — expired ones included. */
  listFor(userId: UserId): Promise<PermissionRule[]>;

  /**
   * One page of this person's rules, filtered and sorted — the rules management screen's listing
   * ([15 · B-10]). The empty filter and the default sort (`grantedAt desc`) read **exactly** what
   * {@link listFor} reads, minus the revoked ones — the first page with no `cursor` is unchanged in
   * content from before the plan (S-01, S-02).
   */
  listPage(request: PermissionRuleListRequest): Promise<PermissionRuleListPage>;

  /**
   * Every rule of this person matching [filter], **unpaginated** — for the redundancy analysis
   * ([15 · B-15], future), which needs the whole set of active rules, never the page a screen has
   * loaded, and for the usage-sorted page of {@link listPage}'s use case, which cannot sort before it
   * knows the usage the trail alone can say.
   */
  listAllMatching(userId: UserId, filter: PermissionRuleListFilter): Promise<PermissionRule[]>;

  /** Counts over the same predicate {@link listPage} would read, for the tabs and the nav badge. */
  summarize(
    userId: UserId,
    filter: PermissionRuleListFilter,
    now: Date,
  ): Promise<PermissionRuleSummary>;

  /**
   * Writes a revocation, unless the rule is already revoked. Only ever called with a rule the
   * domain has just revoked.
   *
   * **Atomic**, for the same reason as {@link grant}: two clients revoking at the same moment both
   * read the rule as active, and only one of them may be the revocation — the one whose instant
   * the row keeps, and the one the trail records (S-46).
   */
  saveRevocation(rule: PermissionRule): Promise<RuleRevocation>;

  /**
   * Writes a revocation for every id of [ruleIds] that is not revoked already, in **one**
   * instruction — the atomicity [15 · D-06](../../../../../docs/plans/15-rules-management/decisions.md#d-06--revogar-em-lote-atômico-ou-por-item)
   * asks for. Idempotent per id, the same as {@link saveRevocation}: an id already revoked comes
   * back unchanged rather than failing the batch, in the same order [ruleIds] was given.
   *
   * Every id is assumed the caller's own and existing already — checked by {@link findById} before
   * this is ever called, never here.
   */
  saveRevocations(ruleIds: readonly string[], at: Date): Promise<RuleRevocation[]>;

  /**
   * Writes a new validity, unless the rule has moved since the caller read it. **The write decides
   * the race, not an earlier read** ([15 · D-01 · S-74, S-75](../../../../../docs/plans/15-rules-management/decisions.md#d-01--o-que-se-edita-numa-regra)):
   * only a row whose `expiresAt` still equals [expectedExpiresAt] and whose `revokedAt` is still
   * `null` is touched — a concurrent revocation or another `PATCH` that won first leaves this one
   * with nothing written, and the rule exactly as it now stands so the caller can tell the two
   * apart.
   *
   * @param clearReminder `true` on an extension — the reminder was about a validity the rule no
   *   longer has ([15 · D-18 · S-78](../../../../../docs/plans/15-rules-management/decisions.md#d-18--por-onde-o-lembrete-de-expiração-chega));
   *   `false` on a shortening, which leaves it for the job to see the new, closer date on its own
   */
  changeExpiry(
    ruleId: string,
    expectedExpiresAt: Date,
    newExpiresAt: Date,
    clearReminder: boolean,
  ): Promise<RuleExpiryChange>;
}

export const PERMISSION_RULE_REPOSITORY = Symbol('PermissionRuleRepository');
