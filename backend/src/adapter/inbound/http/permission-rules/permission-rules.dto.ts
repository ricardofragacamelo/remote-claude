import { z } from 'zod';

import { PERSISTED_PERMISSION_SCOPES } from '@domain/permission';
import type { ListedPermissionRule } from '@application/permission';

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
});

export type GrantPermissionRuleBody = z.infer<typeof grantPermissionRuleSchema>;

/**
 * One rule, as the client sees it.
 *
 * `status` is computed at the moment of the answer, because the list shows an expired rule marked
 * and not missing — and the client has no clock worth trusting for that.
 */
export interface PermissionRuleDto {
  readonly id: string;
  readonly scope: string;

  /** The canonical kind the pattern names — `shell`, `file.edit` —, `null` on a disabled rule. */
  readonly kind: string | null;

  /**
   * The kind again, or the engine's pattern of a disabled rule — kept beside for the published app,
   * which reads it (plan 28, D-22).
   */
  readonly toolName: string;

  /**
   * The pattern exactly as written, in the canonical grammar — or, on a disabled rule, the engine's
   * grammar it was written in, for the person to write it again.
   */
  readonly pattern: string;
  readonly decision: string;
  readonly projectPath: string | null;

  /** The engine the rule is restricted to, or `null` for every engine whose calls have the kind. */
  readonly engine: string | null;
  /** Who granted it. Always the caller, since nobody sees another person's rules. */
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  /** `active`, `expired`, `revoked` or `disabled`. */
  readonly status: string;
  readonly revokedAt: string | null;

  /** Why the rule was switched off — `{ reason: 'untranslatable' }` —, or `null`. */
  readonly disabled: { readonly reason: string } | null;
}

/** The listing. An object and not a bare array, so the response can grow a field later. */
export interface PermissionRuleListDto {
  readonly rules: readonly PermissionRuleDto[];
}

/** The transport shape of a rule. */
export function toPermissionRuleDto({ rule, status }: ListedPermissionRule): PermissionRuleDto {
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
    disabled: rule.disabledReason === null ? null : { reason: rule.disabledReason },
  };
}
