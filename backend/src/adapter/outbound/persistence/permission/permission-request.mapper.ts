import type { PermissionRequest } from '@domain/permission';
import type { permissionRequests } from '@infra/database/schema';

type PermissionRequestInsert = typeof permissionRequests.$inferInsert;

/**
 * The row a request should be written as, in whichever of its two states it is in.
 *
 * One function and not two, because the two writes differ by exactly the settlement: restating the
 * other eleven columns for the update is how an `open` row and a `settle` row come to disagree
 * about the same request.
 */
export function toRow(request: PermissionRequest, now: Date): PermissionRequestInsert {
  const resolution = request.resolution;

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
    decision: resolution?.decision ?? null,
    reason: resolution?.reason ?? null,
    scope: resolution?.scope ?? null,
    resolvedBy: resolution?.resolvedBy?.value ?? null,
    resolvedFrom: resolution?.resolvedFrom ?? null,
    auto: resolution?.auto ?? null,
    ruleId: resolution?.ruleId ?? null,
    extensionsUsed: request.extensionsUsed,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    resolvedAt: resolution?.at ?? null,
    updatedAt: now,
  };
}
