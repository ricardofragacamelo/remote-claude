import { DomainError } from '@domain/shared';

/**
 * The path is outside every configured root.
 *
 * `403` and not `404`: the answer confirms nothing about what exists on the machine, because no
 * root was matched in the first place. What it does say is "do not bother insisting" — which is
 * exactly the honest answer for a path the allowlist will never contain.
 */
export class WorkspaceNotAllowedError extends DomainError {
  readonly code = 'WORKSPACE_NOT_ALLOWED';
  readonly messageKey = 'workspace.error.notAllowed';

  constructor(path: string) {
    super(`${path} is outside every allowed root`, { path });
  }
}
