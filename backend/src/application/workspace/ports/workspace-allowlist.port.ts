import type { WorkspaceAllowlist } from '@domain/workspace';

/**
 * Where the current allowlist comes from.
 *
 * It is read on **every** use, never captured once at construction: the list is reloadable, and a
 * use case holding a snapshot of it would keep serving roots the operator has already removed.
 *
 * The reload is explicit and never a watch. An allowlist that shrinks underneath an open session
 * moves the security boundary without anybody deciding to — see
 * docs/plans/01-live-session/decisions.md#d-02.
 */
export interface WorkspaceAllowlistSource {
  current(): WorkspaceAllowlist;
}

export const WORKSPACE_ALLOWLIST_SOURCE = Symbol('WorkspaceAllowlistSource');
