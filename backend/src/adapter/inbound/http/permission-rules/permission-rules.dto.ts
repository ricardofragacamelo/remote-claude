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
  pattern: z.string().min(1).max(4096),
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
  readonly toolName: string;
  /** The pattern exactly as written, in the grammar of the Claude Code settings. */
  readonly pattern: string;
  readonly decision: string;
  readonly projectPath: string | null;
  /** Who granted it. Always the caller, since nobody sees another person's rules. */
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly status: string;
  readonly revokedAt: string | null;
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
    toolName: rule.pattern.toolName,
    pattern: rule.ruleContent,
    decision: rule.decision,
    projectPath: rule.projectPath,
    grantedBy: rule.userId.value,
    grantedAt: rule.createdAt.toISOString(),
    expiresAt: rule.expiresAt.toISOString(),
    status,
    revokedAt: rule.revokedAt?.toISOString() ?? null,
  };
}
