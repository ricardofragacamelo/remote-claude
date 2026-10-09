/**
 * The facts the trail records that are **not** a tool invocation.
 *
 * Registering, approving and revoking a device are security decisions of the same weight as
 * authorising a command, and `08-authentication` puts them in the trail for that reason. So are
 * granting and revoking a permission rule: a rule is an authorisation given in advance, and "who
 * allowed this to run without asking, and when did they stop" has to be answerable from the trail.
 *
 * So is picking a conversation up again: a resume hands whoever asks the context of everything said
 * before, and a fork of one begun in the editor gives it a second life under a new id.
 *
 * And so is an undo: it changes files on the user's disk, and a change to the disk that leaves no
 * trace is exactly what the trail exists to prevent.
 *
 * And so is a person writing to the disk from the web: creating, saving, moving, copying and
 * deleting files of the open folder. A human editing over Claude's work is a new actor on the same
 * machine, and "who changed this file?" has to have an answer — recorded **before** the disk, with
 * paths, sizes and hashes, never the contents. `file.failed` points at a fact whose write the disk
 * then refused, so the trail never asserts a write that did not happen; `file.restored` is a version
 * of the local history written back — an ordinary write, recorded before the disk like the others
 * ([07 · D-02](../../../../../docs/plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).
 * Downloading is a read, and it is here all the same: `file.downloaded` takes contents off the
 * machine, which is what the trail exists to tell — recorded before the first byte (07 · F7).
 *
 * And so is changing how Claude works on this machine (plan 13): a default, an MCP server — a
 * program that runs with the user's credentials whenever a session opens —, an approval of a
 * repository's `.mcp.json`, a plugin, and switching on the skills of the user or of the system. Each
 * widens what runs before anybody is asked, and is recorded **before** the effect, with the command
 * or address in full and only the **names** of variables, never a value. Testing a server is here
 * too: it runs the command.
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
  'session.resumed',
  'session.forked',
  'session.filesRewound',
  'file.created',
  'file.written',
  'file.moved',
  'file.copied',
  'file.deleted',
  'file.failed',
  'file.downloaded',
  'file.restored',
  'claude.defaultsChanged',
  'claude.mcpServerAdded',
  'claude.mcpServerChanged',
  'claude.mcpServerRemoved',
  'claude.mcpServerToggled',
  'claude.mcpServerTested',
  'claude.mcpProjectServerApproved',
  'claude.mcpProjectServerRejected',
  'claude.pluginAdded',
  'claude.pluginUpdated',
  'claude.pluginToggled',
  'claude.pluginRemoved',
  'claude.skillSourceToggled',
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

/** Whether `value` is a kind this build knows. Used where a row is read back. */
export function isAuditEventKind(value: string): value is AuditEventKind {
  return (AUDIT_EVENT_KINDS as readonly string[]).includes(value);
}
