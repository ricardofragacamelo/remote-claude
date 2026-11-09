import { z } from 'zod';

import type {
  PermissionRuleBatchPayload,
  PermissionRuleEvaluationPayload,
  PermissionRuleHistoryPayload,
  PermissionRuleInvocationPagePayload,
  PermissionRuleListPayload,
  PermissionRulePayload,
  PermissionRulePreviewPayload,
  PermissionRuleSimulationPayload,
  PermissionRuleSummaryPayload,
  PermissionRuleTemplatesPayload,
  // B-18: kept out of the alphabetical run above — a drifting prefix match against this file's
  // own import block was enough to cross jscpd's duplication floor (plan 15, 09-code-quality.md).
  PermissionRuleExportPayload,
  PermissionRuleImportPreviewPayload,
  PermissionRuleImportResultPayload,
} from '@remote-claude/contracts';

import type { AuditEventPage, DisclosedAuditPage } from '@application/audit';
import { PERMISSION_RULE_SORT_FIELDS } from '@application/permission';
import type {
  ListedPermissionRule,
  ListedPermissionRuleItem,
  PermissionEvaluation,
  PermissionRuleListFilter,
  PermissionRulePreview,
  PermissionRuleSummary,
  PermissionSimulation,
  RuleExportFile,
  RuleImportPreview,
  RuleImportResult,
  RuleTemplate,
  SimulationChange,
} from '@application/permission';
import { PERSISTED_PERMISSION_SCOPES, describeReach, ruleEtag } from '@domain/permission';
import type {
  PermissionDecision,
  PermissionRule,
  PermissionRuleStatus,
  RuleFinding,
} from '@domain/permission';
import { disclosedInput } from '@domain/audit';
import type { ToolSubject } from '@domain/engine';
import type { ToolClassifiers } from '@application/engine';
import { toAuditEventDto } from '../audit/audit-events.dto';
import { toAuditEntryDto } from '../audit/audit.dto';

/** `status` on the query string: comma-separated, each one validated. */
const STATUS_VALUES: readonly PermissionRuleStatus[] = ['active', 'expired', 'revoked', 'disabled'];

function parseStatusList(raw: string, ctx: z.RefinementCtx): PermissionRuleStatus[] {
  const values = raw.split(',').map((value) => value.trim());

  for (const value of values) {
    if (!(STATUS_VALUES as readonly string[]).includes(value)) {
      ctx.addIssue({ code: 'custom', message: `unknown status ${value}` });
      return [];
    }
  }

  return values as PermissionRuleStatus[];
}

/** `scope`/`decision`/`engine`/`expiresBefore` — shared by the listing and the summary (B-10). */
const narrowingFilterFields = {
  scope: z.enum(PERSISTED_PERMISSION_SCOPES).optional(),
  decision: z.enum(['allow', 'deny']).optional(),
  engine: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,31}$/)
    .optional(),
  expiresBefore: z.iso.datetime({ offset: true }).optional(),
};

/** `GET /permission-rules`: every filter, the sort and the cursor page. */
export const listPermissionRulesQuerySchema = z.object({
  status: z.string().min(1).transform(parseStatusList).optional(),
  ...narrowingFilterFields,
  kind: z.string().min(1).max(64).optional(),
  folder: z.string().min(1).max(4096).optional(),
  /** Literal — never a wildcard (S-45); escaped before it reaches SQL. */
  q: z.string().min(1).max(200).optional(),
  sort: z.enum(PERMISSION_RULE_SORT_FIELDS).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  /** Opaque — as a previous page's `nextCursor` gave it. */
  cursor: z.string().min(1).max(2048).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export type ListPermissionRulesQuery = z.infer<typeof listPermissionRulesQuerySchema>;

/** `GET /permission-rules/summary`: the same narrowing filters as the listing, no sort or page. */
export const summarizePermissionRulesQuerySchema = z.object(narrowingFilterFields);

export type SummarizePermissionRulesQuery = z.infer<typeof summarizePermissionRulesQuerySchema>;

/** `GET /permission-rules/:ruleId/invocations`: a keyset page over the trail. */
export const ruleInvocationsQuerySchema = z.object({
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type RuleInvocationsQuery = z.infer<typeof ruleInvocationsQuerySchema>;

/**
 * The listing's query, turned into the filter the use case reads.
 *
 * `summarizePermissionRulesQuerySchema` is the narrower of the two — no `status`, `kind`, `folder`
 * or `q` — so those read as "not given" rather than branching on which schema this is.
 */
export function toListFilter(
  query: ListPermissionRulesQuery | SummarizePermissionRulesQuery,
): PermissionRuleListFilter {
  const wide = query as Partial<ListPermissionRulesQuery>;

  return {
    status: wide.status ?? [],
    scope: query.scope ?? null,
    decision: query.decision ?? null,
    engine: query.engine ?? null,
    kind: wide.kind ?? null,
    folder: wide.folder ?? null,
    expiresBefore: query.expiresBefore === undefined ? null : new Date(query.expiresBefore),
    q: wide.q ?? null,
  };
}

/**
 * What `POST /permission-rules` is sent.
 *
 * Format only. Whether the pattern is in the grammar, whether the lifetime fits under the ceiling
 * and whether a `project` rule names its project are the domain's questions, and each has its own
 * code — a schema that answered them would answer all three with the same `INVALID_INPUT`.
 */
export const grantPermissionRuleSchema = z.object({
  /** In the canonical grammar — `shell(git status:*)`, `file.edit(src/**)` (plan 28, B-31). */
  pattern: z.string().min(1).max(4096),
  /** The engine the rule is restricted to; absent for every engine whose calls have the kind. */
  engine: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,31}$/)
    .optional(),
  decision: z.enum(['allow', 'deny']),
  scope: z.enum(PERSISTED_PERMISSION_SCOPES),
  /** The workspace root. Required for `project` — the domain says so — and ignored for `always`. */
  projectPath: z.string().min(1).max(4096).optional(),
  /** Absent means the configured default. */
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  /**
   * `true` says the caller has seen and accepted a `broad` pattern (plan 15, D-09). Ignored for
   * `deny`, which is never too broad; `unbounded` is refused whatever this says.
   */
  acknowledgeBroad: z.boolean().optional(),
  /** The catalog template this rule comes from, when it was created from one. */
  templateId: z.string().min(1).max(200).optional(),
});

export type GrantPermissionRuleBody = z.infer<typeof grantPermissionRuleSchema>;

const ENGINE_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** A call's subject, as a screen or an API client names it — every field optional, by kind. */
const toolSubjectSchema = z
  .object({
    paths: z.array(z.string().min(1).max(4096)).max(50).optional(),
    command: z.string().min(1).max(8192).optional(),
    pattern: z.string().min(1).max(4096).optional(),
    url: z.string().min(1).max(4096).optional(),
    query: z.string().min(1).max(4096).optional(),
    server: z.string().min(1).max(200).optional(),
    tool: z.string().min(1).max(200).optional(),
    description: z.string().min(1).max(4096).optional(),
  })
  .strict();

/** What `POST /permission-rules/evaluate` is sent — a call to test, never run (plan 15, B-14). */
export const evaluatePermissionSchema = z.object({
  engine: z.string().regex(ENGINE_NAME),
  kind: z.string().min(1).max(64),
  subject: toolSubjectSchema,
  /** A raw folder, resolved against the allowlist exactly as creating a `project` rule is. */
  folder: z.string().min(1).max(4096).optional(),
  /** Ignored, and read from the session instead, when `sessionId` names a live one. */
  mode: z.enum(['ask', 'acceptEdits', 'readOnly', 'allowAll']).optional(),
  /** A live session of the caller's own — adds its `session` rules and its current mode. */
  sessionId: z.string().min(1).max(64).optional(),
  draft: z
    .object({
      pattern: z.string().min(1).max(4096),
      decision: z.enum(['allow', 'deny']),
      engine: z.string().regex(ENGINE_NAME).optional(),
    })
    .optional(),
});

export type EvaluatePermissionBody = z.infer<typeof evaluatePermissionSchema>;

/** What `POST /permission-rules/preview` is sent — a draft nobody has granted yet (plan 15, B-15). */
export const previewPermissionRuleSchema = z.object({
  pattern: z.string().min(1).max(4096),
  engine: z.string().regex(ENGINE_NAME).optional(),
  decision: z.enum(['allow', 'deny']),
  scope: z.enum(PERSISTED_PERMISSION_SCOPES),
  projectPath: z.string().min(1).max(4096).optional(),
});

export type PreviewPermissionRuleBody = z.infer<typeof previewPermissionRuleSchema>;

/**
 * What `POST /permission-rules/simulate` is sent — a lot of drafts and removals weighed against the
 * caller's last invocations, never stored (plan 15, B-16, D-15).
 */
export const simulatePermissionRulesSchema = z.object({
  add: z
    .array(
      z.object({
        pattern: z.string().min(1).max(4096),
        decision: z.enum(['allow', 'deny']),
        engine: z.string().regex(ENGINE_NAME).optional(),
      }),
    )
    .max(10)
    .optional(),
  remove: z.array(z.string().min(1).max(64)).max(100).optional(),
  /** The folder `add`'s drafts are scoped to — `project` there, or `always` when absent. */
  folder: z.string().min(1).max(4096).optional(),
  /** Default 200, ceiling 1000 ([15 · D-15]). */
  limit: z.number().int().min(1).max(1000).optional(),
});

export type SimulatePermissionRulesBody = z.infer<typeof simulatePermissionRulesSchema>;

/** What `POST /permission-rules/import/preview` is sent — the file, verbatim (plan 15, B-18). */
export const previewRuleImportSchema = z.object({
  file: z.string().min(1),
});

export type PreviewRuleImportBody = z.infer<typeof previewRuleImportSchema>;

/**
 * What `POST /permission-rules/import` is sent — the same file the preview read, its `digest`, the
 * indices accepted and acknowledged, and how a `project` item's path maps to one of this machine
 * (plan 15, B-18, D-17).
 */
export const importRulesSchema = z.object({
  file: z.string().min(1),
  digest: z.string().min(1),
  accept: z.array(z.number().int().min(0)).max(500),
  acknowledgeBroad: z.array(z.number().int().min(0)).max(500).optional(),
  folderMap: z.record(z.string(), z.string()).optional(),
  /** Overrides the default/ceiling validity for the whole lot — the file's own is always ignored. */
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export type ImportRulesBody = z.infer<typeof importRulesSchema>;

/** The four fields a draft and a grant share — `pattern`, `engine`, `decision`, `scope`. */
export function patternFieldsOf<
  T extends {
    pattern: string;
    engine?: string | undefined;
    decision: PermissionDecision;
    scope: string;
  },
>(body: T): Pick<T, 'pattern' | 'decision' | 'scope'> & { engine: string | null } {
  return {
    pattern: body.pattern,
    engine: body.engine ?? null,
    decision: body.decision,
    scope: body.scope,
  };
}

/** The subject of `POST /permission-rules/evaluate`, with only the fields it was given. */
export function toToolSubject(subject: EvaluatePermissionBody['subject']): ToolSubject {
  return {
    ...(subject.paths === undefined ? {} : { paths: subject.paths }),
    ...(subject.command === undefined ? {} : { command: subject.command }),
    ...(subject.pattern === undefined ? {} : { pattern: subject.pattern }),
    ...(subject.url === undefined ? {} : { url: subject.url }),
    ...(subject.query === undefined ? {} : { query: subject.query }),
    ...(subject.server === undefined ? {} : { server: subject.server }),
    ...(subject.tool === undefined ? {} : { tool: subject.tool }),
    ...(subject.description === undefined ? {} : { description: subject.description }),
  };
}

/**
 * What `PATCH /permission-rules/:ruleId` is sent — the new validity, and nothing else (plan 15,
 * D-01, S-79). `strict`: a body that also names `pattern`, `scope` or `decision` is `400`, not a
 * silent no-op on the fields this route does not edit — a client that thought it changed the
 * pattern deserves to find out it did not. Whether the validity is in the future, within the
 * ceiling, and whether `If-Match` names the rule's current version are the domain's questions,
 * each with its own code.
 */
export const patchRuleExpirySchema = z
  .object({
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type PatchRuleExpiryBody = z.infer<typeof patchRuleExpirySchema>;

/**
 * What `POST /permission-rules/revoke` and `POST /permission-rules/restore` are sent — a lot of ids,
 * at least one and at most the ceiling the atomic write accepts ([15 · D-06]).
 */
export const ruleIdsSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
});

export type RuleIdsBody = z.infer<typeof ruleIdsSchema>;

/**
 * The transport shape of a rule — the fields the domain alone can say (plan 15, B-02): `reach` and
 * `breadth` over the canonical pattern, `etag` over `expiresAt`/`revokedAt`, and, on a `disabled`
 * rule, the pattern as it was written and why it was switched off. `usage` and `folderReachable`
 * need the trail and the allowlist, which only {@link toListedPermissionRuleItemDto} has.
 */
export function toPermissionRuleDto(
  { rule, status }: ListedPermissionRule,
  findings?: readonly RuleFinding[],
): PermissionRulePayload {
  return {
    id: rule.id,
    scope: rule.scope,
    kind: rule.kind,
    toolName: rule.kind ?? rule.ruleContent,
    pattern: rule.ruleContent,
    decision: rule.decision,
    projectPath: rule.projectPath,
    engine: rule.engine,
    grantedBy: rule.userId.value,
    grantedAt: rule.createdAt.toISOString(),
    expiresAt: rule.expiresAt.toISOString(),
    status,
    revokedAt: rule.revokedAt?.toISOString() ?? null,
    // `null` here means "origin not recorded" — a rule granted before this column existed — never a
    // guess (plan 15, S-35).
    grantedVia: rule.grantedVia,
    grantedFromRequestId: rule.grantedFromRequestId,
    templateId: rule.templateId,
    restoredFrom: rule.restoredFrom,
    breadth: rule.breadth,
    etag: ruleEtag(rule),
    ...disabledFieldsOf(rule),
    ...reachFieldOf(rule),
    ...(findings === undefined ? {} : { findings }),
  };
}

/** `disabled`, `legacyPattern` and `disabledReason` — all three, or none, by the same test. */
function disabledFieldsOf(
  rule: PermissionRule,
): Pick<PermissionRulePayload, 'disabled' | 'legacyPattern' | 'disabledReason'> {
  if (rule.disabledReason === null) {
    return { disabled: null, legacyPattern: null, disabledReason: null };
  }

  return {
    disabled: { reason: rule.disabledReason },
    legacyPattern: rule.ruleContent,
    disabledReason: {
      messageKey: `permission.error.ruleDisabledReason.${rule.disabledReason}`,
      params: {},
    },
  };
}

/** `reach`, structured by the domain over the canonical pattern — `null` on a `disabled` rule. */
function reachFieldOf(rule: PermissionRule): Pick<PermissionRulePayload, 'reach'> {
  if (rule.pattern === null) {
    return { reach: null };
  }

  const reach = describeReach(rule.pattern, rule.decision, rule.engine);

  return { reach: { ...reach, content: reach.form === 'any' ? null : reach.content } };
}

/** `GET /permission-rules`, the page. */
export function toPermissionRuleListPageDto(
  items: readonly ListedPermissionRuleItem[],
  nextCursor: string | null,
  windowDays: number,
): PermissionRuleListPayload {
  return {
    rules: items.map((item) => toListedPermissionRuleItemDto(item, windowDays)),
    nextCursor,
  };
}

/** `POST /permission-rules/revoke` and `POST /permission-rules/restore` — the rules the call touched. */
export function toPermissionRuleBatchDto(
  rules: readonly PermissionRule[],
  now: Date,
): PermissionRuleBatchPayload {
  return { rules: rules.map((rule) => toPermissionRuleDto({ rule, status: rule.statusAt(now) })) };
}

/** `GET /permission-rules/summary`. */
export function toPermissionRuleSummaryDto(
  summary: PermissionRuleSummary,
): PermissionRuleSummaryPayload {
  return summary;
}

/**
 * `GET /permission-rules/:ruleId/invocations` — the same entries `GET /audit-entries` shows
 * (`toAuditEntryDto`, never a second mapper), never a `Read`'s content (S-61).
 */
export function toRuleInvocationPageDto(
  page: DisclosedAuditPage,
): PermissionRuleInvocationPagePayload {
  return {
    invocations: page.records.map(toAuditEntryDto),
    nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
  };
}

/** `GET /permission-rules/:ruleId/history` — the same facts `GET /audit-events` shows, filtered. */
export function toRuleHistoryDto(page: AuditEventPage): PermissionRuleHistoryPayload {
  return { events: page.records.map(toAuditEventDto) };
}

/** {@link toPermissionRuleDto}, with what the listing alone adds (plan 15, B-10). */
export function toListedPermissionRuleItemDto(
  item: ListedPermissionRuleItem,
  windowDays: number,
): PermissionRulePayload {
  return {
    ...toPermissionRuleDto(item, item.findings),
    usage:
      item.usage === null
        ? null
        : {
            count: item.usage.count,
            lastUsedAt: item.usage.lastUsedAt?.toISOString() ?? null,
            windowDays,
          },
    folderReachable: item.folderReachable,
    expiryCeiling: item.expiryCeiling?.toISOString() ?? null,
  };
}

/** `POST /permission-rules/evaluate` — the answer, with every rule that matched (plan 15, B-14). */
export function toEvaluationDto(evaluation: PermissionEvaluation): PermissionRuleEvaluationPayload {
  // Every rule here matched, which only an active one ever does (`PermissionRule.matches`) — the
  // draft included, built with a lifetime far past any test.
  const asRule = (rule: PermissionRule): PermissionRulePayload =>
    toPermissionRuleDto({ rule, status: 'active' });

  return {
    outcome: evaluation.outcome,
    answeringRule: evaluation.answeringRule === null ? null : asRule(evaluation.answeringRule),
    matching: evaluation.matching.map(asRule),
    reasons: [...evaluation.reasons],
    caveats: [...evaluation.caveats],
  };
}

/** `POST /permission-rules/preview` — what a draft would reach, and what it means (plan 15, B-15). */
export function toPermissionRulePreviewDto(
  preview: PermissionRulePreview,
): PermissionRulePreviewPayload {
  return {
    pattern: preview.pattern,
    reach: {
      ...preview.reach,
      content: preview.reach.form === 'any' ? null : preview.reach.content,
    },
    breadth: preview.breadth,
    findings: [...preview.findings],
  };
}

/**
 * `POST /permission-rules/simulate` — what the last invocations would have become, under the rules
 * being weighed (plan 15, B-16). Every entry goes through the same disclosure `GET /audit-entries`
 * applies, never the raw input (S-132).
 */
export function toSimulationDto(
  simulation: PermissionSimulation,
  classifiers: ToolClassifiers,
): PermissionRuleSimulationPayload {
  return {
    counts: simulation.counts,
    changes: simulation.changes.map((change) => toSimulationChangeDto(change, classifiers)),
    withoutFolder: simulation.withoutFolder,
    assumedMode: simulation.assumedMode,
  };
}

/** `GET /permission-rules/templates` — the catalog, with each rule's reach and breadth ([15 · B-17]). */
export function toRuleTemplatesDto(
  templates: readonly RuleTemplate[],
): PermissionRuleTemplatesPayload {
  return {
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      rules: template.rules.map((rule) => ({
        pattern: rule.pattern,
        decision: rule.decision,
        reach: { ...rule.reach, content: rule.reach.form === 'any' ? null : rule.reach.content },
        breadth: rule.breadth,
      })),
    })),
  };
}

/** `GET /permission-rules/export` — the caller's own rules, in the file's own shape ([15 · B-18]). */
export function toRuleExportDto(file: RuleExportFile): PermissionRuleExportPayload {
  return {
    format: file.format,
    version: file.version,
    exportedAt: file.exportedAt,
    rules: file.rules.map((item) => ({ ...item })),
  };
}

/** `POST /permission-rules/import/preview` — one verdict per item ([15 · B-18]). */
export function toRuleImportPreviewDto(
  preview: RuleImportPreview,
): PermissionRuleImportPreviewPayload {
  return {
    digest: preview.digest,
    items: preview.items.map((item) => ({
      index: item.index,
      pattern: item.pattern,
      decision: item.decision,
      scope: item.scope,
      verdict: item.verdict.kind,
      ...(item.verdict.kind === 'invalid'
        ? { code: item.verdict.code }
        : { breadth: item.verdict.breadth }),
    })),
  };
}

/** `POST /permission-rules/import` — what the lot actually created ([15 · B-18]). */
export function toRuleImportResultDto(
  result: RuleImportResult,
  now: Date,
): PermissionRuleImportResultPayload {
  return {
    counts: result.counts,
    rules: result.rules.map((rule) => toPermissionRuleDto({ rule, status: rule.statusAt(now) })),
  };
}

function toSimulationChangeDto(
  change: SimulationChange,
  classifiers: ToolClassifiers,
): PermissionRuleSimulationPayload['changes'][number] {
  const { entry } = change.record;
  const input = entry.input.value;
  const tool = classifiers.classify(null, entry.toolName, input);

  return {
    before: change.before,
    after: change.after,
    entry: toAuditEntryDto({
      ...change.record,
      disclosed: disclosedInput(tool, input),
      kind: entry.toolKind ?? tool.kind,
    }),
    answeringRule:
      change.answeringRule === null
        ? null
        : toPermissionRuleDto({ rule: change.answeringRule, status: 'active' }),
  };
}
