import type {
  PermissionRuleHistoryPayload,
  PermissionRuleInvocationPagePayload,
} from '@remote-claude/contracts';

import { api } from '@/shared/api/api';
import type {
  ApplyRuleImportInput,
  ChangeRuleExpiryInput,
  EvaluateRuleInput,
  GrantRuleInput,
  PermissionRule,
  PreviewRuleInput,
  RuleBatch,
  RuleEvaluation,
  RuleExport,
  RuleFilters,
  RuleImportPreview,
  RuleImportResult,
  RuleListQuery,
  RulePage,
  RulePreview,
  RuleSimulation,
  RuleSummary,
  RuleTemplates,
  SimulateRulesInput,
} from '../types/rule';

/** The filters/sort fields, in the order the query string carries them — the same filter is the same URL. */
const LIST_FIELDS = [
  'status',
  'scope',
  'decision',
  'engine',
  'kind',
  'folder',
  'q',
  'expiresBefore',
  'sort',
  'order',
] as const;

/** `RuleFilters`' own fields — the summary and the export take these and nothing of the listing's. */
const FILTER_FIELDS = [
  'status',
  'scope',
  'decision',
  'engine',
  'kind',
  'folder',
  'q',
  'expiresBefore',
] as const;

function queryOf(
  query: object,
  fields: readonly string[],
  extra: Readonly<Record<string, string | null>> = {},
): string {
  const params = new URLSearchParams();
  const record = query as Record<string, unknown>;

  for (const field of fields) {
    const value = record[field];

    if (value === undefined || value === '') {
      continue;
    }

    params.set(field, Array.isArray(value) ? value.join(',') : String(value));
  }

  for (const [field, value] of Object.entries(extra)) {
    if (value !== null) {
      params.set(field, value);
    }
  }

  return params.toString();
}

/**
 * One page of the caller's rules, newest first unless `query.sort` says otherwise — the expired
 * ones included and marked, the revoked ones gone unless asked for (plan 15, B-10, S-01, S-02).
 *
 * @throws {import('@/shared/api/errors').AppError} `INVALID_INPUT` for a filter or a cursor the
 *   server does not read
 */
export async function fetchRules(query: RuleListQuery, cursor: string | null): Promise<RulePage> {
  const search = queryOf(query, LIST_FIELDS, { cursor });
  const page = await api.get<{ rules: readonly PermissionRule[]; nextCursor?: string | null }>(
    search === '' ? '/permission-rules' : `/permission-rules?${search}`,
  );

  return { rules: page.rules, nextCursor: page.nextCursor ?? null };
}

/** Counts over the same predicate the listing reads — for the tab labels and the nav badge (B-10). */
export async function fetchRuleSummary(filters: Readonly<RuleFilters>): Promise<RuleSummary> {
  const search = queryOf(filters, FILTER_FIELDS);

  return api.get<RuleSummary>(
    search === '' ? '/permission-rules/summary' : `/permission-rules/summary?${search}`,
  );
}

/**
 * One rule by id, in whatever state it is — the revoked one included. It is how a trail entry
 * leads to the rule that answered it.
 *
 * @throws {import('@/shared/api/errors').AppError} `PERMISSION_RULE_NOT_FOUND`, `PERMISSION_NOT_OWNED`
 */
export async function fetchRule(ruleId: string): Promise<PermissionRule> {
  return api.get<PermissionRule>(`/permission-rules/${encodeURIComponent(ruleId)}`);
}

/** The invocations a rule answered — "14 usos" opens to these same lines (plan 15, B-11). */
export async function fetchRuleInvocations(
  ruleId: string,
  cursor: number | null,
): Promise<PermissionRuleInvocationPagePayload> {
  const search = cursor === null ? '' : `?cursor=${String(cursor)}`;

  return api.get<PermissionRuleInvocationPagePayload>(
    `/permission-rules/${encodeURIComponent(ruleId)}/invocations${search}`,
  );
}

/** The events of one rule — granted, validity changed, revoked, restored (plan 15, B-11). */
export async function fetchRuleHistory(ruleId: string): Promise<PermissionRuleHistoryPayload> {
  return api.get<PermissionRuleHistoryPayload>(
    `/permission-rules/${encodeURIComponent(ruleId)}/history`,
  );
}

/**
 * Granting a rule by hand. Idempotent on the server: the same rule twice is the one rule.
 *
 * @throws {import('@/shared/api/errors').AppError} `PERMISSION_RULE_PATTERN_INVALID`,
 *   `PERMISSION_RULE_TOO_BROAD`, `PERMISSION_RULE_EXPIRY_TOO_LONG`
 */
export async function grantRule(input: GrantRuleInput): Promise<PermissionRule> {
  return api.post<PermissionRule>('/permission-rules', input);
}

/**
 * Taking a rule back. It stops answering on the very next request, in every open session.
 *
 * @throws {import('@/shared/api/errors').AppError} `PERMISSION_RULE_NOT_FOUND`, `PERMISSION_NOT_OWNED`
 */
export async function revokeRule(ruleId: string): Promise<PermissionRule> {
  return api.delete<PermissionRule>(`/permission-rules/${encodeURIComponent(ruleId)}`);
}

/**
 * Shortening or extending the one thing a rule ever edits under its own id — `If-Match` so a stale
 * screen never overwrites a change it never saw (plan 15, B-12).
 *
 * @throws {import('@/shared/api/errors').AppError} `PRECONDITION_FAILED` (412, stale `etag`),
 *   `PERMISSION_RULE_STATE_CONFLICT` (409), `PERMISSION_RULE_EXPIRY_TOO_LONG`
 */
export async function changeRuleExpiry(input: ChangeRuleExpiryInput): Promise<PermissionRule> {
  return api.patch<PermissionRule>(
    `/permission-rules/${encodeURIComponent(input.ruleId)}`,
    { expiresAt: input.expiresAt },
    { headers: { 'if-match': input.etag } },
  );
}

/** Revoking several rules at once, atomic in validation and in the write (plan 15, B-13, D-06). */
export async function revokeRules(ruleIds: readonly string[]): Promise<RuleBatch> {
  return api.post<RuleBatch>('/permission-rules/revoke', { ids: ruleIds });
}

/** Undoing a revocation, while the window is still open (plan 15, D-11). */
export async function restoreRules(ruleIds: readonly string[]): Promise<RuleBatch> {
  return api.post<RuleBatch>('/permission-rules/restore', { ids: ruleIds });
}

/** Testing a command without running it — the same precedence a live session uses (plan 15, B-14). */
export async function evaluateRule(input: EvaluateRuleInput): Promise<RuleEvaluation> {
  return api.post<RuleEvaluation>('/permission-rules/evaluate', input);
}

/** What a pattern nobody has granted yet would reach, and what it means (plan 15, B-15). */
export async function previewRule(input: PreviewRuleInput): Promise<RulePreview> {
  return api.post<RulePreview>('/permission-rules/preview', input);
}

export async function simulateRules(input: SimulateRulesInput): Promise<RuleSimulation> {
  return api.post<RuleSimulation>('/permission-rules/simulate', input);
}

/** The catalog of pre-built rule bundles (plan 15, B-17). */
export async function fetchRuleTemplates(): Promise<RuleTemplates> {
  return api.get<RuleTemplates>('/permission-rules/templates');
}

/** The caller's own rules, in the file a screen offers to download (plan 15, B-18). */
export async function fetchRuleExport(filters: Readonly<RuleFilters>): Promise<RuleExport> {
  const search = queryOf(filters, FILTER_FIELDS);

  return api.get<RuleExport>(
    search === '' ? '/permission-rules/export' : `/permission-rules/export?${search}`,
  );
}

/** What an import file would do, item by item, before a single byte of it is written (plan 15, B-18). */
export async function previewRuleImport(file: string): Promise<RuleImportPreview> {
  return api.post<RuleImportPreview>('/permission-rules/import/preview', { file });
}

export async function applyRuleImport(input: ApplyRuleImportInput): Promise<RuleImportResult> {
  return api.post<RuleImportResult>('/permission-rules/import', input);
}
