/**
 * The facts the trail records that are **not** a tool invocation.
 *
 * Registering, approving and revoking a device are security decisions of the same weight as
 * authorising a command, and `08-authentication` puts them in the trail for that reason. So are
 * granting and revoking a permission rule: a rule is an authorisation given in advance, and "who
 * allowed this to run without asking, and when did they stop" has to be answerable from the trail.
 *
 * They do not fit `audit_entries`, which is shaped around one invocation — a session, a tool, an
 * input — so they get their own table in the same module rather than three nullable columns in
 * that one.
 */
export const AUDIT_EVENT_KINDS = [
  'device.registered',
  'device.approved',
  'device.revoked',
  'device.expired',
  'permission.ruleGranted',
  'permission.ruleRevoked',
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

/** Whether `value` is a kind this build knows. Used where a row is read back. */
export function isAuditEventKind(value: string): value is AuditEventKind {
  return (AUDIT_EVENT_KINDS as readonly string[]).includes(value);
}
