import { api } from '@/shared/api/api';
import type { PermissionRule, RuleDisabled } from '../types/rule';

/**
 * A rule as the backend answers it. It stops existing at the end of this file. The fields plan 28
 * added are optional, so a backend from before them still reads; `toolName` — kept by the server
 * for the published app — is not read at all: the screen names a rule by its kind.
 */
type RuleWire = Omit<PermissionRule, 'kind' | 'engine' | 'disabled'> & {
  readonly kind?: string | null;
  readonly engine?: string | null;
  readonly disabled?: RuleDisabled | null;
};

/** The shape the backend answers a listing with. */
interface RuleListResponse {
  readonly rules: readonly RuleWire[];
}

/** The rule the screens know, from the one the backend sent — nothing else of the wire leaks. */
function toRule(wire: RuleWire): PermissionRule {
  return {
    id: wire.id,
    scope: wire.scope,
    kind: wire.kind ?? null,
    pattern: wire.pattern,
    decision: wire.decision,
    projectPath: wire.projectPath,
    grantedBy: wire.grantedBy,
    grantedAt: wire.grantedAt,
    expiresAt: wire.expiresAt,
    status: wire.status,
    revokedAt: wire.revokedAt,
    engine: wire.engine ?? null,
    disabled: wire.disabled ?? null,
  };
}

/**
 * The rules of this user, newest first — the expired and the disabled ones included and marked,
 * the revoked ones gone.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`
 */
export async function fetchRules(): Promise<readonly PermissionRule[]> {
  return (await api.get<RuleListResponse>('/permission-rules')).rules.map(toRule);
}

/**
 * One rule by id, in whatever state it is — the revoked one included. It is how a trail entry
 * leads to the rule that answered it.
 *
 * @throws {import('@/shared/api/errors').AppError} `PERMISSION_RULE_NOT_FOUND`, `PERMISSION_NOT_OWNED`
 */
export async function fetchRule(ruleId: string): Promise<PermissionRule> {
  return toRule(await api.get<RuleWire>(`/permission-rules/${encodeURIComponent(ruleId)}`));
}

/**
 * Takes a rule back. It stops answering on the very next request, in every open session.
 *
 * Idempotent on the server: revoking twice answers the same rule, revoked, twice.
 *
 * @throws {import('@/shared/api/errors').AppError} `PERMISSION_RULE_NOT_FOUND`, `PERMISSION_NOT_OWNED`
 */
export async function revokeRule(ruleId: string): Promise<PermissionRule> {
  return toRule(
    await api.request<RuleWire>(`/permission-rules/${encodeURIComponent(ruleId)}`, {
      method: 'DELETE',
    }),
  );
}
