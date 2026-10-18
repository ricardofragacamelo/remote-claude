import { z } from 'zod';

import type { PermissionRulePayload } from '@remote-claude/contracts';

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

/** The transport shape of a rule. */
export function toPermissionRuleDto({ rule, status }: ListedPermissionRule): PermissionRulePayload {
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
