import type { PermissionRequest, PermissionResolution } from '@domain/permission';
import type { permissionRequests } from '@infra/database/schema';

type PermissionRequestInsert = typeof permissionRequests.$inferInsert;

/** The columns only a settled request fills. */
type SettlementColumns = Pick<
  PermissionRequestInsert,
  'decision' | 'reason' | 'scope' | 'resolvedBy' | 'resolvedFrom' | 'auto' | 'ruleId' | 'resolvedAt'
>;

/** A request still waiting on its answer: the settlement is written as nothing at all. */
const UNSETTLED: SettlementColumns = {
  decision: null,
  reason: null,
  scope: null,
  resolvedBy: null,
  resolvedFrom: null,
  auto: null,
  ruleId: null,
  resolvedAt: null,
};

/**
 * The row a request should be written as, in whichever of its two states it is in.
 *
 * One function and not two, because the two writes differ by exactly the settlement: restating the
 * other eleven columns for the update is how an `open` row and a `settle` row come to disagree
 * about the same request.
 */
export function toRow(request: PermissionRequest, now: Date): PermissionRequestInsert {
  return {
    id: request.id,
    userId: request.userId.value,
    sessionId: request.sessionId.value,
    toolUseId: request.toolUseId,
    toolName: request.toolName,
    // The exact input, whole. Truncation belongs to the log, never to the record.
    input: request.input,
    riskHint: request.riskHint,
    status: request.status,
    ...settlementOf(request.resolution),
    extensionsUsed: request.extensionsUsed,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    updatedAt: now,
  };
}

/** The settlement's columns, or {@link UNSETTLED} while there is none. */
function settlementOf(resolution: PermissionResolution | null): SettlementColumns {
  if (resolution === null) {
    return UNSETTLED;
  }

  return {
    decision: resolution.decision,
    reason: resolution.reason,
    scope: resolution.scope,
    resolvedBy: resolution.resolvedBy?.value ?? null,
    resolvedFrom: resolution.resolvedFrom,
    auto: resolution.auto,
    ruleId: resolution.ruleId ?? null,
    resolvedAt: resolution.at,
  };
}
