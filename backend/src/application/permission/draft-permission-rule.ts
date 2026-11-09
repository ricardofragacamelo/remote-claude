import { PermissionRule } from '@domain/permission';
import type { PermissionDecision, PermissionRule as Rule } from '@domain/permission';
import type { UserId } from '@domain/auth';

/** A pattern weighed without being stored — what `evaluate`, `preview` and `simulate` all build. */
export interface RuleDraft {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly engine?: string | null;
}

const DRAFT_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * [draft] as a {@link PermissionRule}, with no id and a lifetime far past any test — long enough
 * that it is never what makes a comparison expire mid-test, never actually persisted
 * ([15 · B-14](../../../../docs/plans/15-rules-management/F1-rules-backend.md#b-14--testar-um-comando),
 * [15 · B-16](../../../../docs/plans/15-rules-management/F1-rules-backend.md#b-16--simular-contra-as-últimas-invocações-da-trilha)).
 */
export function draftPermissionRule(
  draft: RuleDraft,
  userId: UserId,
  folder: string | null,
  now: Date,
): Rule {
  return PermissionRule.create(
    {
      id: '',
      userId,
      sessionId: null,
      projectPath: folder,
      pattern: draft.pattern,
      engine: draft.engine ?? null,
      decision: draft.decision,
      scope: folder === null ? 'always' : 'project',
      createdAt: now,
      expiresAt: new Date(now.getTime() + DRAFT_LIFETIME_MS),
    },
    DRAFT_LIFETIME_MS,
  );
}
