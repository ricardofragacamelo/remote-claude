import { api } from '@/shared/api/api';
import type { PermissionRule } from '../types/rule';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface RuleListResponse {
  readonly rules: readonly PermissionRule[];
}

/**
 * The rules of this user, newest first — the expired ones included and marked, the revoked ones
 * gone.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`
 */
export async function fetchRules(): Promise<readonly PermissionRule[]> {
  return (await api.get<RuleListResponse>('/permission-rules')).rules;
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

/**
 * Takes a rule back. It stops answering on the very next request, in every open session.
 *
 * Idempotent on the server: revoking twice answers the same rule, revoked, twice.
 *
 * @throws {import('@/shared/api/errors').AppError} `PERMISSION_RULE_NOT_FOUND`, `PERMISSION_NOT_OWNED`
 */
export async function revokeRule(ruleId: string): Promise<PermissionRule> {
  return api.request<PermissionRule>(`/permission-rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}
